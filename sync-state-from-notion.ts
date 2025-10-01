// sync-state-from-notion.ts
// Rebuilds .rss_seen.json from existing Notion pages to avoid duplicates

import { Client } from "@notionhq/client";
import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  timeoutMs: 30000,
});

const DATABASE_ID = process.env.NOTION_DB_ID!;
const STATE_FILE = process.env.STATE_FILE || ".rss_seen.json";

interface StateStructure {
  feeds: {
    [feedUrl: string]: {
      seen: {
        [guid: string]: boolean;
      };
    };
  };
}

async function getAllNotionPages() {
  console.log("📥 Fetching all pages from Notion...");
  const pages: any[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    pages.push(...response.results);
    pageCount += response.results.length;
    console.log(`   Fetched ${pageCount} pages so far...`);

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  console.log(`✅ Total pages found: ${pages.length}`);
  return pages;
}

async function rebuildStateFile() {
  try {
    // Get all pages from Notion
    const pages = await getAllNotionPages();

    // Build state structure
    const state: StateStructure = { feeds: {} };
    const urlToSource: { [url: string]: string } = {};

    console.log("\n🔨 Building state file...");

    for (const page of pages) {
      if (!("properties" in page)) continue;

      // Extract URL and Source
      const urlProp = page.properties?.URL;
      const sourceProp = page.properties?.Source;

      const url = urlProp?.url || null;
      const source = sourceProp?.select?.name || "Unknown";

      if (url) {
        urlToSource[url] = source;
      }
    }

    // We don't have the feed URLs, so we'll mark URLs as seen
    // and let future runs organize them properly by feed
    // For now, use URL as both feed key and GUID
    console.log(`   Found ${Object.keys(urlToSource).length} unique URLs`);

    for (const [url, source] of Object.entries(urlToSource)) {
      // Use a placeholder feed structure - future runs will reorganize
      const feedKey = `_notion_import_${source.replace(/[^a-zA-Z0-9]/g, "_")}`;

      if (!state.feeds[feedKey]) {
        state.feeds[feedKey] = { seen: {} };
      }

      // Mark the URL as seen using the URL as GUID
      // This matches our fallback: `it.guid || it.id || it.link`
      state.feeds[feedKey].seen[url] = true;
    }

    // Save state file
    console.log(`\n💾 Writing state to ${STATE_FILE}...`);
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");

    console.log(`✅ State file rebuilt successfully!`);
    console.log(`   Total sources: ${Object.keys(state.feeds).length}`);
    console.log(`   Total URLs marked as seen: ${Object.keys(urlToSource).length}`);
    console.log(`\n⚠️  Note: Feed organization will be corrected on next sync run`);

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

rebuildStateFile()
  .then(() => {
    console.log("\n✅ Done! Safe to run npm start now.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });

