// src/rss.ts

import RSSParser from "rss-parser";
import type { Feed, FeedItem } from "./types.js";
import { log, verbose } from "./logger.js";

const rss = new RSSParser({ timeout: 20000 });

export async function fetchFeedItems(
  feed: Feed,
  linkValidate = false,
  linkTimeoutMs = 8000
): Promise<FeedItem[]> {
  try {
    const parsed = await rss.parseURL(feed.url);
    const items = parsed.items || [];

    // Normalize items to our standard format
    const normalized = items.map((it) => ({
      guid: it.guid || it.id || it.link || `${feed.url}#${it.title ?? "no-title"}`,
      title: it.title || "(no title)",
      link: it.link || it.enclosure?.url || "",
      pubDate: it.isoDate || it.pubDate || new Date().toISOString(),
      summary: it.contentSnippet || it.content || "",
      source: feed.title || parsed.title || new URL(feed.url).hostname,
    }));

    if (!linkValidate) return normalized;

    // Validate links
    const checked: FeedItem[] = [];
    for (const it of normalized) {
      if (!it.link) {
        checked.push(it);
        continue;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), linkTimeoutMs);
        const res = await fetch(it.link, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status >= 200 && res.status < 400) {
          checked.push(it);
          verbose(`Link OK: ${it.link}`);
        } else {
          log(`Skip ${res.status} for ${it.link}`, "warn");
        }
      } catch (e: any) {
        log(`Skip (link check failed) ${it.link}: ${e?.message || e}`, "warn");
      }
    }

    return checked;
  } catch (e) {
    const error = e as Error;
    log(`Feed error: ${feed.url} -> ${error.message || error}`, "warn");
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

