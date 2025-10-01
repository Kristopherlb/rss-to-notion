#!/usr/bin/env node
// src/index.ts
/**
 * RSS → Notion bridge with pruning and batching
 *
 * Features
 * - Reads a Feedly OPML file to discover RSS feeds
 * - Fetches new items across all feeds
 * - Writes one Notion page per item into a Notion database
 * - Marks items default "Unread"; you can set to "Read" or "Archived" in Notion
 * - Prunes old items automatically (age + status rules) and enforces a per‑feed cap
 * - Persists a local seen‑item cache to avoid duplicates
 *
 * Usage
 * 1) Node 18+ required (for global fetch and top‑level await)
 * 2) npm install
 * 3) Create a Notion integration and share your target database with it
 * 4) Create .env next to this file (see .env.example)
 * 5) Run: npm run dev -- --opml ./feeds.opml --db <NOTION_DB_ID>
 *    Or build and run: npm run build && npm start -- --opml ./feeds.opml --db <NOTION_DB_ID>
 * 6) Add to cron (every 30 min): 0,30 * * * * cd /path/to/project && npm start -- --opml ./feeds.opml --db YOUR_DB_ID >> /var/log/rss_to_notion.log 2>&1
 *
 * Notion database schema (create these properties)
 * - Title      (Title)
 * - URL        (URL)
 * - Published  (Date)
 * - Source     (Select)
 * - Summary    (Rich text)
 * - Status     (Select) values: Unread, Read, Archived
 */

import { loadConfig } from "./config.js";
import { loadState, saveState } from "./state.js";
import { parseOpml } from "./opml.js";
import { fetchFeedItems, mapWithConcurrency } from "./rss.js";
import type { FeedItem } from "./types.js";
import {
  createNotionClient,
  createPagesInBatches,
  pruneNotion,
  enforcePerFeedCap,
} from "./notion.js";
import { aiTriage } from "./ai.js";
import { setLogLevel, always, log } from "./logger.js";
import { shouldSkipFeed, updateFeedStats, generateQualityReport } from "./feed-quality.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  // Set global timeout to prevent hanging
  const timeoutMs = config.globalTimeoutMinutes * 60 * 1000;
  setTimeout(() => {
    log(`⏱️  Global timeout reached (${config.globalTimeoutMinutes} minutes) - exiting`, "error");
    process.exit(2); // Exit code 2 = timeout
  }, timeoutMs);

  log(`⏱️  Global timeout set: ${config.globalTimeoutMinutes} minutes`, "info");

  // Parse OPML to get feeds
  const allFeeds = await parseOpml(config.opmlPath);
  if (allFeeds.length === 0) {
    log("No feeds found in OPML", "error");
    process.exit(1);
  }

  // Filter out auto-disabled low-quality feeds
  const state = await loadState(config.stateFile);
  const disabledFeeds: string[] = [];

  const feeds = allFeeds.filter((f) => {
    const shouldSkip = shouldSkipFeed(f, state, config.autoDisableThreshold, config.autoDisableMinSample);
    if (shouldSkip) {
      disabledFeeds.push(f.url);
      const stats = state.feeds[f.url]?.stats;
      log(`Skipping low-quality feed (${(stats!.quality * 100).toFixed(0)}%): ${f.url}`, "warn");
    }
    return !shouldSkip;
  });

  if (disabledFeeds.length > 0) {
    always(`Feeds: ${feeds.length} (${disabledFeeds.length} auto-disabled due to low quality)`);
  } else {
    always(`Feeds: ${feeds.length}`);
  }

  // Ensure all feeds have state entries
  for (const f of feeds) {
    if (!state.feeds[f.url]) {
      state.feeds[f.url] = { seen: {} };
    }
  }

  // Fetch feed items in parallel with concurrency control
  const perFeedItems = await mapWithConcurrency(feeds, config.concurrency, (feed) =>
    fetchFeedItems(feed, config.linkValidate, config.linkTimeoutMs)
  );

  // Filter new items based on per-feed seen cache and age
  const newItems: FeedItem[] = [];
  const feedItemsMap: { [feedUrl: string]: FeedItem[] } = {};
  const maxAge = config.maxArticleAgeDays > 0
    ? Date.now() - (config.maxArticleAgeDays * 24 * 60 * 60 * 1000)
    : 0;

  for (let i = 0; i < feeds.length; i++) {
    const f = feeds[i];
    const items = perFeedItems[i] || [];
    const feedState = state.feeds[f.url];
    feedItemsMap[f.url] = [];

    for (const it of items) {
      // Skip if already seen
      if (feedState.seen[it.guid]) continue;

      // Skip if too old (if age limit is set)
      if (maxAge > 0 && new Date(it.pubDate).getTime() < maxAge) {
        feedState.seen[it.guid] = true; // Mark as seen so we don't check again
        continue;
      }

      newItems.push(it);
      feedState.seen[it.guid] = true;
      feedItemsMap[f.url].push(it);
    }
  }

  // Sort newest first to create recent pages first
  newItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // Limit number of articles for testing/debugging
  if (config.maxArticles > 0 && newItems.length > config.maxArticles) {
    always(`Limiting to ${config.maxArticles} articles (from ${newItems.length})`);
    newItems.splice(config.maxArticles);
  }

  always(`New items: ${newItems.length}`);

  // AI triage before writing to Notion
  const triaged = await aiTriage(
    newItems,
    config.openaiApiKey,
    config.aiModel,
    config.aiMaxTokens,
    config.aiTriage,
    config.aiBatchSize,
    config.aiConcurrency,
    config.aiSummary,
    config.aiSummaryMaxTokens
  );

  always(`New items after triage: ${triaged.length}`);

  // Create Notion client and process items
  const notion = createNotionClient(config.notionToken);

  if (triaged.length) {
    always("\n📤 Creating pages in Notion...");
    await createPagesInBatches(
      notion,
      triaged,
      config.notionDbId,
      config.batchSize,
      config.requestDelayMs
    );
    always("✅ All pages created");

    // Update feed quality stats based on AI decisions
    for (const [feedUrl, items] of Object.entries(feedItemsMap)) {
      if (items.length > 0) {
        updateFeedStats(state, feedUrl, items);
      }
    }

    await saveState(state, config.stateFile);
  } else {
    await saveState(state, config.stateFile);
  }

  // Prune old items and enforce caps
  log("Pruning old items...", "info");
  await pruneNotion(notion, config.notionDbId, config.pruneMaxAgeDays);
  if (config.perFeedHardCap > 0) {
    log("Enforcing per-feed cap...", "info");
    await enforcePerFeedCap(notion, config.notionDbId, config.perFeedHardCap);
  }

  always("Done");
}

main()
  .then(async () => {
    // Show feed quality report after sync
    const state = await loadState(process.env.STATE_FILE || ".rss_seen.json");
    generateQualityReport(state);

    always("\n✅ Sync completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    log(`❌ Fatal error: ${error}`, "error");
    process.exit(1);
  });

