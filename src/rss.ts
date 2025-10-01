// src/rss.ts

import RSSParser from "rss-parser";
import type { Feed, FeedItem } from "./types.js";

const rss = new RSSParser({ timeout: 20000 });

export async function fetchFeedItems(feed: Feed): Promise<FeedItem[]> {
  try {
    const parsed = await rss.parseURL(feed.url);
    const items = parsed.items || [];

    // Normalize items to our standard format
    return items.map((it) => ({
      guid: it.guid || it.id || it.link || `${feed.url}#${it.title ?? "no-title"}`,
      title: it.title || "(no title)",
      link: it.link || it.enclosure?.url || "",
      pubDate: it.isoDate || it.pubDate || new Date().toISOString(),
      summary: it.contentSnippet || it.content || "",
      source: feed.title || parsed.title || new URL(feed.url).hostname,
    }));
  } catch (e) {
    const error = e as Error;
    console.error(`Feed error: ${feed.url} ->`, error.message || error);
    return [];
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = [];
  let i = 0;

  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        ret[idx] = await fn(items[idx], idx);
      }
    });

  await Promise.all(workers);
  return ret;
}

