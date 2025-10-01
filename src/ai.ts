// src/ai.ts

import type { FeedItem } from "./types.js";
import fs from "fs/promises";
import path from "path";
import url from "url";
import { recordAICost } from "./metrics.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let cachedPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;

  try {
    const promptPath = path.join(__dirname, "..", "ai-prompt.txt");
    cachedPrompt = await fs.readFile(promptPath, "utf-8");
    return cachedPrompt;
  } catch {
    // Fallback to default if file not found
    return "You are an RSS triage assistant. Output valid JSON only.";
  }
}

async function triageBatch(
  batch: FeedItem[],
  systemPrompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  includeSummary: boolean,
  summaryMaxTokens: number
): Promise<FeedItem[]> {
  const itemsText = batch
    .map(
      (it, idx) => `
[Article ${idx + 1}]
Title: ${it.title}
Source: ${it.source}
Published: ${it.pubDate}
URL: ${it.link}
Summary: ${String(it.summary).slice(0, 800)}`
    )
    .join("\n---");

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze these ${batch.length} articles and return a JSON array with decisions.

${itemsText}

Return JSON array with ${batch.length} objects, each with:
- decision: "keep" | "deprioritize" | "ignore"
- priority: "High" | "Normal" | "Low"
- topics: array of up to 5 tags
- reason: brief explanation (<100 chars)
${includeSummary ? '- abstract: concise 1-2 sentence summary (≤280 chars, factual, no emojis)' : ''}

Example: [{"decision":"keep","priority":"High","topics":["DevOps","Kubernetes"],"reason":"Technical deep-dive"${includeSummary ? ',"abstract":"Explains how to optimize K8s costs using resource limits and autoscaling."' : ''}}]`,
      },
    ],
    temperature: 0.1,
    max_tokens: includeSummary
      ? Math.max(maxTokens, summaryMaxTokens) * batch.length
      : maxTokens * batch.length,
    response_format: { type: "json_object" },
  };

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json: any = await resp.json();
    const text = json.choices?.[0]?.message?.content?.trim() || "{}";

    // Track token usage and cost
    if (json.usage) {
      recordAICost(
        json.usage.prompt_tokens || 0,
        json.usage.completion_tokens || 0,
        model
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
      // Handle if response is wrapped in a key
      const results = Array.isArray(parsed) ? parsed : parsed.results || parsed.articles || [];

      if (results.length !== batch.length) {
        throw new Error(`Expected ${batch.length} results, got ${results.length}`);
      }

      return batch.map((it, idx) => ({
        ...it,
        _ai: results[idx] || {
          decision: "keep",
          priority: "Normal",
          topics: [],
          reason: "parse-error",
        },
      }));
    } catch (e: any) {
      console.error(`   ✗ Batch parse error: ${e.message}`);
      // Fallback to keep all
      return batch.map((it) => ({
        ...it,
        _ai: { decision: "keep" as const, priority: "Normal" as const, topics: [], reason: "batch-parse-failed" },
      }));
    }
  } catch (e: any) {
    console.error(`   ✗ Batch API error: ${e.message}`);
    return batch.map((it) => ({
      ...it,
      _ai: { decision: "keep" as const, priority: "Normal" as const, topics: [], reason: "batch-api-error" },
    }));
  }
}

export async function aiTriage(
  items: FeedItem[],
  apiKey: string,
  model: string,
  maxTokens: number,
  enabled: boolean,
  batchSize = 10,
  concurrency = 5,
  includeSummary = true,
  summaryMaxTokens = 180
): Promise<FeedItem[]> {
  if (!enabled || !apiKey) {
    return items.map((it) => ({
      ...it,
      _ai: {
        decision: "keep" as const,
        priority: "Normal" as const,
        topics: [],
        reason: "AI disabled",
      },
    }));
  }

  const systemPrompt = await loadSystemPrompt();
  console.log(`🤖 AI triage: ${items.length} articles in batches of ${batchSize} (${concurrency} parallel)...`);

  // Split into batches
  const batches: FeedItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // Process batches with concurrency
  const triaged: FeedItem[] = [];
  let batchIndex = 0;

  const processBatch = async (): Promise<void> => {
    while (batchIndex < batches.length) {
      const idx = batchIndex++;
      const batch = batches[idx];

      console.log(`   Batch ${idx + 1}/${batches.length} (${batch.length} articles)...`);
      const results = await triageBatch(batch, systemPrompt, apiKey, model, maxTokens, includeSummary, summaryMaxTokens);

      for (const result of results) {
        triaged.push(result);
        const decision = result._ai?.decision || "keep";
        const priority = result._ai?.priority || "Normal";
        console.log(`      → "${result.title.slice(0, 50)}..." = ${decision} (${priority})`);
      }
    }
  };

  // Run with concurrency limit
  const workers = Array(Math.min(concurrency, batches.length))
    .fill(0)
    .map(() => processBatch());

  await Promise.all(workers);

  return triaged;
}
