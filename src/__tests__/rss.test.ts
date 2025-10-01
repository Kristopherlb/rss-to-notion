// src/__tests__/rss.test.ts

import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../rss.js";

describe("RSS Utilities", () => {

  it("should map items with concurrency control", async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = async (n: number) => n * 2;

    const results = await mapWithConcurrency(items, 2, fn);

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("should handle empty array", async () => {
    const items: number[] = [];
    const fn = async (n: number) => n * 2;

    const results = await mapWithConcurrency(items, 2, fn);

    expect(results).toEqual([]);
  });

  it("should limit concurrency correctly", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let concurrent = 0;
    let maxConcurrent = 0;

    const fn = async (n: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return n;
    };

    await mapWithConcurrency(items, 3, fn);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});

