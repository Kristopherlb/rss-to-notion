// src/__tests__/ai.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiTriage } from "../ai.js";
import type { FeedItem } from "../types.js";

// Mock global fetch
global.fetch = vi.fn();

describe("AI Triage", () => {
  const mockItem: FeedItem = {
    guid: "test-123",
    title: "Test Article",
    link: "https://example.com/test",
    pubDate: new Date().toISOString(),
    summary: "This is a test article about DevOps",
    source: "Test Source",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should classify articles in batches with AI enabled", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  decision: "keep",
                  priority: "High",
                  topics: ["DevOps", "Testing"],
                  reason: "Relevant technical content",
                  abstract: "Test abstract summary",
                },
              ]),
            },
          },
        ],
      }),
    });

    const result = await aiTriage([mockItem], "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result).toHaveLength(1);
    expect(result[0]._ai?.decision).toBe("keep");
    expect(result[0]._ai?.priority).toBe("High");
    expect(result[0]._ai?.topics).toEqual(["DevOps", "Testing"]);
    expect(result[0]._ai?.abstract).toBe("Test abstract summary");
  });

  it("should handle multiple articles in one batch", async () => {
    const items = [mockItem, { ...mockItem, guid: "test-456", title: "Second Article" }];

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  decision: "keep",
                  priority: "High",
                  topics: ["DevOps"],
                  reason: "First article",
                  abstract: "Summary 1",
                },
                {
                  decision: "deprioritize",
                  priority: "Low",
                  topics: ["Opinion"],
                  reason: "Second article",
                  abstract: "Summary 2",
                },
              ]),
            },
          },
        ],
      }),
    });

    const result = await aiTriage(items, "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result).toHaveLength(2);
    expect(result[0]._ai?.decision).toBe("keep");
    expect(result[1]._ai?.decision).toBe("deprioritize");
  });

  it("should handle batch parse errors gracefully", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        choices: [
          {
            message: {
              content: "Invalid JSON response",
            },
          },
        ],
      }),
    });

    const result = await aiTriage([mockItem], "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result[0]._ai?.reason).toBe("batch-parse-failed");
  });

  it("should default to keep when AI disabled", async () => {
    const result = await aiTriage([mockItem], "test-key", "gpt-4o-mini", 400, false, 10, 1, true, 180);

    expect(result).toHaveLength(1);
    expect(result[0]._ai?.decision).toBe("keep");
    expect(result[0]._ai?.reason).toBe("AI disabled");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should default to keep when API key missing", async () => {
    const result = await aiTriage([mockItem], "", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result[0]._ai?.reason).toBe("AI disabled");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should handle API error gracefully", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("API Error"));

    const result = await aiTriage([mockItem], "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result[0]._ai?.reason).toBe("batch-api-error");
  });

  it("should handle wrong array length in response", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([]), // Empty array when expecting 1 result
            },
          },
        ],
      }),
    });

    const result = await aiTriage([mockItem], "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result[0]._ai?.reason).toBe("batch-parse-failed");
  });

  it("should batch multiple items efficiently", async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { decision: "keep", priority: "Normal", topics: [], reason: "test1", abstract: "Summary 1" },
                { decision: "keep", priority: "Normal", topics: [], reason: "test2", abstract: "Summary 2" },
              ]),
            },
          },
        ],
      }),
    });

    const items = [mockItem, { ...mockItem, guid: "test-456" }];
    const result = await aiTriage(items, "test-key", "gpt-4o-mini", 400, true, 10, 1, true, 180);

    expect(result).toHaveLength(2);
    // Should only call API once for both items (batched)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

