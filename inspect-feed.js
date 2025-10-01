// inspect-feed.js - Quick tool to inspect a raw RSS feed
import RSSParser from "rss-parser";

const feedUrl = process.argv[2];
if (!feedUrl) {
  console.error("Usage: node inspect-feed.js <RSS_URL>");
  process.exit(1);
}

const parser = new RSSParser({ timeout: 20000 });

console.log(`\n🔍 Inspecting feed: ${feedUrl}\n`);

try {
  const feed = await parser.parseURL(feedUrl);
  
  console.log("Feed Title:", feed.title);
  console.log("Feed Link:", feed.link);
  console.log("Total Items:", feed.items?.length || 0);
  console.log("\n" + "=".repeat(80));
  console.log("Recent Items (showing first 10):\n");
  
  const items = feed.items || [];
  for (let i = 0; i < Math.min(10, items.length); i++) {
    const it = items[i];
    const pubDate = it.isoDate || it.pubDate || "NO DATE";
    const age = pubDate !== "NO DATE" 
      ? Math.floor((Date.now() - new Date(pubDate).getTime()) / (24 * 60 * 60 * 1000))
      : "?";
    
    console.log(`[${i + 1}] ${age} days old`);
    console.log(`    Title: ${it.title?.slice(0, 70) || "NO TITLE"}`);
    console.log(`    Link:  ${it.link?.slice(0, 70) || "NO LINK"}`);
    console.log(`    Date:  ${pubDate}`);
    console.log(`    GUID:  ${(it.guid || it.id || "NO GUID").slice(0, 70)}`);
    console.log();
  }
  
  console.log("=".repeat(80));
  
  // Date distribution
  const byYear = {};
  for (const it of items) {
    const pubDate = it.isoDate || it.pubDate;
    if (pubDate) {
      const year = new Date(pubDate).getFullYear();
      byYear[year] = (byYear[year] || 0) + 1;
    }
  }
  
  console.log("\n📊 Articles by Year:");
  Object.entries(byYear)
    .sort(([a], [b]) => parseInt(b) - parseInt(a))
    .forEach(([year, count]) => {
      console.log(`  ${year}: ${count} articles`);
    });
    
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}

