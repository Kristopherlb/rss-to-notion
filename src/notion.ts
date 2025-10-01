// src/notion.ts

import { Client } from "@notionhq/client";
import type { FeedItem } from "./types.js";

export function createNotionClient(token: string): Client {
  return new Client({ auth: token });
}

export function notionPageProps(item: FeedItem): any {
  return {
    Title: { title: [{ text: { content: item.title.slice(0, 2000) } }] },
    URL: item.link ? { url: item.link } : undefined,
    Published: { date: { start: new Date(item.pubDate).toISOString() } },
    Source: { select: { name: item.source.slice(0, 100) } },
    Summary: item.summary
      ? { rich_text: [{ type: "text", text: { content: String(item.summary).slice(0, 2000) } }] }
      : { rich_text: [] },
    Status: { select: { name: "Unread" } },
  };
}

export async function createPagesInBatches(
  notion: Client,
  items: FeedItem[],
  databaseId: string,
  batchSize: number
): Promise<void> {
  const batches: FeedItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (it) => {
        try {
          await notion.pages.create({
            parent: { database_id: databaseId },
            properties: notionPageProps(it),
          });
        } catch (e: any) {
          // If the Notion API rejects due to rate limit, backoff and retry once
          if (e.status === 429) {
            const retry = parseInt(e.body?.retry_after || "1", 10) * 1000;
            await new Promise((r) => setTimeout(r, retry));
            await notion.pages.create({
              parent: { database_id: databaseId },
              properties: notionPageProps(it),
            });
          } else {
            console.error("Create failed:", it.title, e.message || e);
          }
        }
      })
    );
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

