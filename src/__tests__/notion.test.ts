// src/__tests__/notion.test.ts

import { describe, it, expect } from "vitest";
import { notionPageProps } from "../notion.js";
import type { FeedItem } from "../types.js";

describe("Notion Page Props", () => {
  const baseItem: FeedItem = {
    guid: "test-123",
    title: "Test Article",
    link: "https://example.com/test",
    pubDate: "2025-10-01T12:00:00Z",
    summary: "Test summary",
    source: "Test Source",
  };

  it("should generate props with all fields", () => {
    const props = notionPageProps(baseItem);

    expect(props.Title.title[0].text.content).toBe("Test Article");
    expect(props.URL.url).toBe("https://example.com/test");
    expect(props.Published.date.start).toBe("2025-10-01T12:00:00.000Z");
    expect(props.Source.select.name).toBe("Test Source");
    expect(props.Summary.rich_text[0].text.content).toContain("Test summary");
    expect(props.Status.select.name).toBe("Unread");
  });

  it("should clean source names by removing commas", () => {
    const item = { ...baseItem, source: "Papers, Please!" };
    const props = notionPageProps(item);

    expect(props.Source.select.name).toBe("Papers - Please!");
  });

  it("should set status to Unread for keep decision", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "keep",
        priority: "High",
        topics: ["DevOps"],
        reason: "Relevant",
      },
    };
    const props = notionPageProps(item);

    expect(props.Status.select.name).toBe("Unread");
  });

  it("should set status to Read for deprioritize decision", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "deprioritize",
        priority: "Low",
        topics: [],
        reason: "Less relevant",
      },
    };
    const props = notionPageProps(item);

    expect(props.Status.select.name).toBe("Read");
  });

  it("should set status to Archived for ignore decision", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "ignore",
        priority: "Low",
        topics: ["Spam"],
        reason: "Not relevant",
      },
    };
    const props = notionPageProps(item);

    expect(props.Status.select.name).toBe("Archived");
  });

  it("should prepend AI metadata and abstract to summary", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "keep",
        priority: "High",
        topics: ["DevOps", "Kubernetes"],
        reason: "Technical content",
        abstract: "This article explains Kubernetes optimization.",
      },
    };
    const props = notionPageProps(item);

    const summary = props.Summary.rich_text[0].text.content;
    expect(summary).toContain("AI Abstract: This article explains Kubernetes optimization.");
    expect(summary).toContain("AI: High");
    expect(summary).toContain("DevOps, Kubernetes");
    expect(summary).toContain("Technical content");
    expect(summary).toContain("Test summary");
  });

  it("should add Tags property when AI provides topics", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "keep",
        priority: "High",
        topics: ["AWS", "Lambda", "Serverless"],
        reason: "Test",
      },
    };
    const props = notionPageProps(item);

    expect(props.Tags).toBeDefined();
    expect(props.Tags.multi_select).toHaveLength(3);
    expect(props.Tags.multi_select[0]).toEqual({ name: "AWS" });
    expect(props.Tags.multi_select[1]).toEqual({ name: "Lambda" });
  });

  it("should not add Tags property when no topics", () => {
    const item: FeedItem = {
      ...baseItem,
      _ai: {
        decision: "keep",
        priority: "Normal",
        topics: [],
        reason: "Test",
      },
    };
    const props = notionPageProps(item);

    expect(props.Tags).toBeUndefined();
  });

  it("should handle missing URL", () => {
    const item = { ...baseItem, link: "" };
    const props = notionPageProps(item);

    expect(props.URL).toBeUndefined();
  });

  it("should handle empty summary", () => {
    const item = { ...baseItem, summary: "" };
    const props = notionPageProps(item);

    expect(props.Summary.rich_text[0].text.content).toBe("");
  });

  it("should truncate long titles to 2000 chars", () => {
    const longTitle = "A".repeat(3000);
    const item = { ...baseItem, title: longTitle };
    const props = notionPageProps(item);

    expect(props.Title.title[0].text.content).toHaveLength(2000);
  });

  it("should truncate long summaries to 2000 chars", () => {
    const longSummary = "B".repeat(3000);
    const item = { ...baseItem, summary: longSummary };
    const props = notionPageProps(item);

    expect(props.Summary.rich_text[0].text.content).toHaveLength(2000);
  });
});

