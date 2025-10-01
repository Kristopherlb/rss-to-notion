// src/__tests__/opml.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { parseOpml } from "../opml.js";

const TEST_DIR = path.join(process.cwd(), "test-fixtures");

describe("OPML Parser", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should parse valid OPML with single feed", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Test</title></head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const testFile = path.join(TEST_DIR, "single.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toEqual({
      url: "https://example.com/feed",
      title: "Test Feed",
    });
  });

  it("should parse OPML with nested categories", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline text="Tech">
      <outline type="rss" text="Feed 1" xmlUrl="https://example.com/1" />
      <outline type="rss" text="Feed 2" xmlUrl="https://example.com/2" />
    </outline>
  </body>
</opml>`;
    const testFile = path.join(TEST_DIR, "nested.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds).toHaveLength(2);
    expect(feeds[0].url).toBe("https://example.com/1");
    expect(feeds[1].url).toBe("https://example.com/2");
  });

  it("should deduplicate feed URLs", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" text="Feed 1" xmlUrl="https://example.com/feed" />
    <outline type="rss" text="Feed 1 Duplicate" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const testFile = path.join(TEST_DIR, "duplicate.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds).toHaveLength(1);
  });

  it("should handle empty OPML", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body></body>
</opml>`;
    const testFile = path.join(TEST_DIR, "empty.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds).toHaveLength(0);
  });

  it("should extract title from multiple attributes", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" text="Text Title" xmlUrl="https://example.com/1" />
    <outline type="rss" title="Title Attr" xmlUrl="https://example.com/2" />
  </body>
</opml>`;
    const testFile = path.join(TEST_DIR, "titles.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds[0].title).toBe("Text Title");
    expect(feeds[1].title).toBe("Title Attr");
  });

  it("should use hostname as fallback title", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const testFile = path.join(TEST_DIR, "no-title.opml");
    await fs.writeFile(testFile, opml);

    const feeds = await parseOpml(testFile);

    expect(feeds[0].title).toBe("example.com");
  });
});

