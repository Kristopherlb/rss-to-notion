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
import {
  createNotionClient,
  createPagesInBatches,
  pruneNotion,
  enforcePerFeedCap,
} from "./notion.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Parse OPML to get feeds
  const feeds = await parseOpml(config.opmlPath);
  if (feeds.length === 0) {
    console.error("No feeds found in OPML");
    process.exit(1);
  }
  console.log(`Feeds: ${feeds.length}`);

  // Load state and ensure all feeds have entries
  const state = await loadState(config.stateFile);
  for (const f of feeds) {
    if (!state.feeds[f.url]) {
      state.feeds[f.url] = { seen: {} };
    }
  }

  // Fetch feed items in parallel with concurrency control
  const perFeedItems = await mapWithConcurrency(
    feeds,
    config.concurrency,
    fetchFeedItems
  );

  // Filter new items based on per-feed seen cache
  const newItems = [];
  for (let i = 0; i < feeds.length; i++) {
    const f = feeds[i];
    const items = perFeedItems[i] || [];
    const feedState = state.feeds[f.url];

    for (const it of items) {
      if (!feedState.seen[it.guid]) {
        newItems.push(it);
        feedState.seen[it.guid] = true;
      }
    }
  }

  // Sort newest first to create recent pages first
  newItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  console.log(`New items: ${newItems.length}`);

  // Create Notion client and process items
  const notion = createNotionClient(config.notionToken);

  if (newItems.length) {
    await createPagesInBatches(notion, newItems, config.notionDbId, config.batchSize);
    await saveState(state, config.stateFile);
  } else {
    // Still save in case feeds were added
    await saveState(state, config.stateFile);
  }

  // Prune old items and enforce caps
  await pruneNotion(notion, config.notionDbId, config.pruneMaxAgeDays);
  if (config.perFeedHardCap > 0) {
    await enforcePerFeedCap(notion, config.notionDbId, config.perFeedHardCap);
  }

  console.log("Done");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

