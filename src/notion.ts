// src/notion.ts

import { Client } from "@notionhq/client";
import type { FeedItem } from "./types.js";

export function createNotionClient(token: string): Client {
  return new Client({
    auth: token,
    timeoutMs: 30000, // 30 second timeout
  });
}

export function notionPageProps(item: FeedItem): any {
  // Notion Select fields don't allow commas - replace with dashes
  const cleanSource = item.source.replace(/,/g, " -").slice(0, 100);

  // Determine status based on AI decision
  const decision = item._ai?.decision || "keep";
  const status =
    decision === "ignore"
      ? "Archived"
      : decision === "deprioritize"
        ? "Read"
        : "Unread";

  // Extract AI topics for Tags
  const aiTopics = Array.isArray(item._ai?.topics) ? item._ai.topics.slice(0, 5) : [];

  // Build summary with AI metadata
  const abstract = item._ai?.abstract ? `AI Abstract: ${item._ai.abstract}\n` : "";
  const aiNote = item._ai
    ? `AI: ${item._ai.priority || ""} | ${aiTopics.join(", ") || ""} | ${item._ai.reason || ""}\n`
    : "";

  const properties: any = {
    Title: { title: [{ text: { content: item.title.slice(0, 2000) } }] },
    URL: item.link ? { url: item.link } : undefined,
    Published: { date: { start: new Date(item.pubDate).toISOString() } },
    Source: { select: { name: cleanSource } },
    Summary: {
      rich_text: [
        { type: "text", text: { content: (abstract + aiNote + (item.summary || "")).slice(0, 2000) } },
      ],
    },
    Status: { select: { name: status } },
  };

  // Add Tags multi-select if AI provided topics
  if (aiTopics.length) {
    properties.Tags = { multi_select: aiTopics.map((name) => ({ name })) };
  }

  return properties;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPageWithRetry(
  notion: Client,
  databaseId: string,
  item: FeedItem,
  maxRetries = 3,
  delayMs = 1000
): Promise<void> {
  console.log(`📝 Creating: "${item.title.slice(0, 60)}..."`);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: notionPageProps(item),
      });
      console.log(`   ✓ Created successfully`);
      return; // Success!
    } catch (e: any) {
      const isLastAttempt = attempt === maxRetries;

      // Rate limit - respect retry_after header
      if (e.status === 429) {
        const retryAfter = parseInt(e.body?.retry_after || "2", 10) * 1000;
        console.warn(`Rate limited, waiting ${retryAfter}ms...`);
        await sleep(retryAfter);
        continue;
      }

      // Conflict error - retry with exponential backoff
      if (e.code === "conflict_error" && !isLastAttempt) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.warn(`Conflict on "${item.title}", retrying in ${backoff}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }

      // Other errors or last attempt - log and give up
      console.error(`   ✗ Failed (attempt ${attempt}/${maxRetries}):`, e.message || e.code || e);
      if (isLastAttempt) {
        console.error(`   ✗ Gave up after ${maxRetries} attempts`);
        return;
      }
    }
  }
}

export async function createPagesInBatches(
  notion: Client,
  items: FeedItem[],
  databaseId: string,
  batchSize: number,
  delayMs = 1000
): Promise<void> {
  const batches: FeedItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    // Process items in batch sequentially with delay
    for (const it of batch) {
      await createPageWithRetry(notion, databaseId, it, 3, delayMs);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }
}

export async function pruneNotion(
  notion: Client,
  databaseId: string,
  maxAgeDays: number
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffISO = cutoff.toISOString();

  // Pass 1: Status = Read AND Published before cutoff → archive
  await notionSearchArchive(notion, databaseId, {
    and: [
      { property: "Status", select: { equals: "Read" } },
      { property: "Published", date: { before: cutoffISO } },
    ],
  });

  // Pass 2: Status = Archived AND Published before cutoff → archive again
  await notionSearchArchive(notion, databaseId, {
    and: [
      { property: "Status", select: { equals: "Archived" } },
      { property: "Published", date: { before: cutoffISO } },
    ],
  });
}

async function notionSearchArchive(
  notion: Client,
  databaseId: string,
  filter: any
): Promise<void> {
  const pageSize = 100;
  let cursor: string | undefined = undefined;

  while (true) {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter,
      page_size: pageSize,
      start_cursor: cursor,
    });

    for (const page of res.results) {
      try {
        await notion.pages.update({ page_id: page.id, archived: true });
      } catch (e: any) {
        console.error("Archive failed:", page.id, e.message || e);
      }
    }

    if (!res.has_more) break;
    cursor = res.next_cursor ?? undefined;
  }
}

export async function enforcePerFeedCap(
  notion: Client,
  databaseId: string,
  hardCap: number
): Promise<void> {
  // Get distinct Sources
  const sources = new Set<string>();
  let cursor: string | undefined = undefined;
  const pageSize = 100;

  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      page_size: pageSize,
      start_cursor: cursor,
      sorts: [{ property: "Published", direction: "descending" }],
    });

    for (const page of res.results) {
      if ("properties" in page) {
        const src = (page.properties?.Source as any)?.select?.name;
        if (src) sources.add(src);
      }
    }

    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  // For each source, enforce the cap
  for (const src of sources) {
    let c: string | undefined = undefined;
    let idx = 0;

    do {
      const res = await notion.databases.query({
        database_id: databaseId,
        filter: { property: "Source", select: { equals: src } },
        sorts: [{ property: "Published", direction: "descending" }],
        page_size: pageSize,
        start_cursor: c,
      });

      for (const page of res.results) {
        idx++;
        if (idx > hardCap) {
          try {
            await notion.pages.update({ page_id: page.id, archived: true });
          } catch (e: any) {
            console.error("Cap-archive failed:", page.id, e.message || e);
          }
        }
      }

      c = res.has_more ? res.next_cursor ?? undefined : undefined;
    } while (c);
  }
}

