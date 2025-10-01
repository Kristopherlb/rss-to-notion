// src/opml.ts

import fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";
import type { Feed } from "./types.js";

interface OPMLOutline {
  outline?: OPMLOutline | OPMLOutline[];
  xmlUrl?: string;
  xmlurl?: string;
  url?: string;
  text?: string;
  title?: string;
  "#text"?: string;
  _text?: string;
}

export async function parseOpml(opmlPath: string): Promise<Feed[]> {
  const xml = await fs.readFile(opmlPath, "utf8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml);

  const feeds: Feed[] = [];

  function walk(node: OPMLOutline | OPMLOutline[] | undefined): void {
    if (!node) return;
    const outlines = Array.isArray(node) ? node : [node];

    for (const o of outlines) {
      if (!o) continue;
      if (o["_text"]) continue; // not expected

      // Recurse into nested outlines
      if (o.outline) walk(o.outline);

      const xmlUrl = o.xmlUrl || o.xmlurl || o.url;
      const text = o.text || o.title || o["#text"];

      if (xmlUrl) {
        feeds.push({
          url: xmlUrl,
          title: text || new URL(xmlUrl).hostname
        });
      }
    }
  }

  const body = doc.opml?.body;
  if (body?.outline) walk(body.outline);

  // Deduplicate by URL
  const unique = new Map<string, Feed>();
  for (const f of feeds) unique.set(f.url, f);

  return [...unique.values()];
}

