// src/feed-quality.ts

import type { StateStructure, FeedStats, FeedItem, Feed } from "./types.js";
import { always } from "./logger.js";

export function shouldSkipFeed(
  feed: Feed,
  state: StateStructure,
  qualityThreshold: number,
  minSampleSize: number
): boolean {
  const feedState = state.feeds[feed.url];
  if (!feedState?.stats) return false;

  const stats = feedState.stats;

  // Need minimum sample size to make a decision
  if (stats.total < minSampleSize) return false;

  // Auto-disable if quality is below threshold
  return stats.quality < qualityThreshold;
}

export function updateFeedStats(
  state: StateStructure,
  feedUrl: string,
  items: FeedItem[]
): void {
  if (!state.feeds[feedUrl]) return;

  const stats = state.feeds[feedUrl].stats || {
    total: 0,
    kept: 0,
    deprioritized: 0,
    ignored: 0,
    quality: 0,
    lastUpdated: new Date().toISOString(),
  };

  for (const item of items) {
    stats.total++;

    const decision = item._ai?.decision || "keep";
    if (decision === "keep") stats.kept++;
    else if (decision === "deprioritize") stats.deprioritized++;
    else if (decision === "ignore") stats.ignored++;
  }

  stats.quality = stats.total > 0 ? stats.kept / stats.total : 0;
  stats.lastUpdated = new Date().toISOString();

  state.feeds[feedUrl].stats = stats;
}

export function generateQualityReport(state: StateStructure): void {
  const feedStats: Array<{ url: string; stats: FeedStats }> = [];

  for (const [url, feedData] of Object.entries(state.feeds)) {
    if (feedData.stats && feedData.stats.total > 0) {
      feedStats.push({ url, stats: feedData.stats });
    }
  }

  // Sort by quality descending
  feedStats.sort((a, b) => b.stats.quality - a.stats.quality);

  always("\n📊 Feed Quality Report (top 10 and bottom 10):");
  always("=".repeat(80));

  // Top 10
  always("\n✅ Best Performing Feeds:");
  for (let i = 0; i < Math.min(10, feedStats.length); i++) {
    const { url, stats } = feedStats[i];
    const quality = (stats.quality * 100).toFixed(0);
    always(`${quality}% quality | ${stats.kept}/${stats.total} kept | ${url.slice(0, 60)}`);
  }

  // Bottom 10
  if (feedStats.length > 10) {
    always("\n⚠️  Worst Performing Feeds:");
    for (let i = Math.max(0, feedStats.length - 10); i < feedStats.length; i++) {
      const { url, stats } = feedStats[i];
      const quality = (stats.quality * 100).toFixed(0);
      const badge = stats.quality < 0.1 ? "🗑️" : stats.quality < 0.3 ? "⚠️" : "";
      always(`${badge} ${quality}% quality | ${stats.kept}/${stats.total} kept | ${url.slice(0, 55)}`);
    }
  }

  // Count low-quality feeds
  const lowQuality = feedStats.filter((f) => f.stats.quality < 0.1 && f.stats.total >= 10);
  if (lowQuality.length > 0) {
    always(`\n💡 Suggestion: ${lowQuality.length} feeds with <10% quality (10+ articles)`);
    always(`   Consider adding them to feed-blacklist.txt`);
  }

  always("=".repeat(80));
}

