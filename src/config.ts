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
  };
}

