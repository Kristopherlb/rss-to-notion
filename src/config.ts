// src/config.ts

import dotenv from "dotenv";
import type { Config } from "./types.js";

dotenv.config();

export function getArg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

export function loadConfig(): Config {
  // Read from .env first, allow command line to override
  const opmlPath = getArg("--opml", process.env.OPML_PATH);
  const notionDbId = getArg("--db", process.env.NOTION_DB_ID);

  if (!opmlPath || !notionDbId) {
    console.error("Usage: rss-to-notion --opml ./feeds.opml --db <NOTION_DB_ID>");
    console.error("Or set OPML_PATH and NOTION_DB_ID in .env file");
    process.exit(1);
  }

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    console.error("Missing NOTION_TOKEN in .env");
    process.exit(1);
  }

  return {
    opmlPath,
    notionDbId,
    notionToken,
    pruneMaxAgeDays: parseInt(process.env.PRUNE_MAX_AGE_DAYS || "30", 10),
    perFeedHardCap: parseInt(process.env.PER_FEED_HARD_CAP || "500", 10),
    stateFile: process.env.STATE_FILE || ".rss_seen.json",
    batchSize: parseInt(process.env.BATCH_SIZE || "20", 10),
    concurrency: parseInt(process.env.CONCURRENCY || "4", 10),
    maxArticleAgeDays: parseInt(process.env.MAX_ARTICLE_AGE_DAYS || "0", 10),
    maxArticles: parseInt(process.env.MAX_ARTICLES || "0", 10),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    aiTriage: (process.env.AI_TRIAGE || "true").toLowerCase() === "true",
    aiModel: process.env.AI_MODEL || "gpt-4o-mini",
    aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS || "400", 10),
    linkValidate: (process.env.LINK_VALIDATE || "true").toLowerCase() === "true",
    linkTimeoutMs: parseInt(process.env.LINK_TIMEOUT_MS || "8000", 10),
    requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || "1000", 10),
    logLevel: (process.env.LOG_LEVEL || "normal") as "quiet" | "normal" | "verbose",
    autoDisableThreshold: parseFloat(process.env.AUTO_DISABLE_THRESHOLD || "0.1"),
    autoDisableMinSample: parseInt(process.env.AUTO_DISABLE_MIN_SAMPLE || "20", 10),
    globalTimeoutMinutes: parseInt(process.env.GLOBAL_TIMEOUT_MINUTES || "10", 10),
    aiBatchSize: parseInt(process.env.AI_BATCH_SIZE || "10", 10),
    aiConcurrency: parseInt(process.env.AI_CONCURRENCY || "5", 10),
    aiSummary: (process.env.AI_SUMMARY || "true").toLowerCase() === "true",
    aiSummaryMaxTokens: parseInt(process.env.AI_SUMMARY_MAX_TOKENS || "180", 10),
  };
}

