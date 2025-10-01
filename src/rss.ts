// src/rss.ts

import RSSParser from "rss-parser";
import type { Feed, FeedItem } from "./types.js";
import { log, verbose } from "./logger.js";

const rss = new RSSParser({ timeout: 20000 });

export async function fetchFeedItems(
  feed: Feed,
  linkValidate = false,
  linkTimeoutMs = 8000,
  maxAgeDays = 0
): Promise<FeedItem[]> {
  try {
    const parsed = await rss.parseURL(feed.url);
    const items = parsed.items || [];

    // Normalize items to our standard format
    let filteredByUrl = 0;
    const normalized = items.map((it) => {
      const link = it.link || it.enclosure?.url || "";

      // Check if URL contains old year (2023 or earlier) - filter immediately
      const urlYear = link.match(/\/(201[0-9]|202[0-3])\//)?.[1];
      if (urlYear) {
        const year = parseInt(urlYear);
        const currentYear = new Date().getFullYear();
        if (year < currentYear - 1) {
          // Skip old republished content
          filteredByUrl++;
          return null;
        }
      }

      return {
        guid: it.guid || it.id || link || `${feed.url}#${it.title ?? "no-title"}`,
        title: it.title || "(no title)",
        link,
        pubDate: it.isoDate || it.pubDate || new Date().toISOString(),
        summary: it.contentSnippet || it.content || "",
        source: feed.title || parsed.title || new URL(feed.url).hostname,
      };
    }).filter(Boolean) as FeedItem[];

    if (filteredByUrl > 0) {
      log(`${feed.title}: Filtered ${filteredByUrl} old articles by URL year`, "info");
    }

    // Filter by age BEFORE link validation to save time/resources
    let filteredByAge = 0;
    const maxAge = maxAgeDays > 0 
      ? Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
      : 0;
    
    const recentItems = maxAge > 0
      ? normalized.filter((it) => {
          const pubDateMs = new Date(it.pubDate).getTime();
          if (pubDateMs < maxAge) {
            filteredByAge++;
            return false;
          }
          return true;
        })
      : normalized;
    
    if (filteredByAge > 0) {
      log(`${feed.title}: Filtered ${filteredByAge} articles older than ${maxAgeDays} days`, "info");
    }

    if (!linkValidate) return recentItems;

    // Validate links (only for recent items)
    const checked: FeedItem[] = [];
    for (const it of recentItems) {
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

