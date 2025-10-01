// src/metrics.ts

import { always } from "./logger.js";

interface TimingMetrics {
  [key: string]: {
    start: number;
    end?: number;
    duration?: number;
  };
}

const timings: TimingMetrics = {};
let totalAICost = 0;
let totalAICalls = 0;
let totalAIInputTokens = 0;
let totalAIOutputTokens = 0;

export function startTimer(label: string): void {
  timings[label] = { start: Date.now() };
}

export function endTimer(label: string): void {
  if (timings[label]) {
    timings[label].end = Date.now();
    timings[label].duration = timings[label].end! - timings[label].start;
  }
}

export function recordAICost(
  inputTokens: number,
  outputTokens: number,
  model: string
): void {
  totalAICalls++;
  totalAIInputTokens += inputTokens;
  totalAIOutputTokens += outputTokens;

  // Pricing per 1M tokens (as of Oct 2025)
  const pricing: { [key: string]: { input: number; output: number } } = {
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  };

  const rates = pricing[model] || pricing["gpt-4o-mini"];
  const cost = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  totalAICost += cost;
}

export function printMetrics(): void {
  always("\n⏱️  Performance Metrics:");
  always("=".repeat(80));

  // Sort timings by duration
  const sorted = Object.entries(timings)
    .filter(([_, t]) => t.duration !== undefined)
    .sort(([_, a], [__, b]) => (b.duration || 0) - (a.duration || 0));

  for (const [label, timing] of sorted) {
    const duration = (timing.duration! / 1000).toFixed(2);
    always(`  ${label.padEnd(30)} ${duration.padStart(8)}s`);
  }

  // AI Cost Summary
  if (totalAICalls > 0) {
    always("\n💰 AI Cost Estimate:");
    always("=".repeat(80));
    always(`  API Calls:        ${totalAICalls.toString().padStart(15)}`);
    always(`  Input Tokens:     ${totalAIInputTokens.toString().padStart(15)}`);
    always(`  Output Tokens:    ${totalAIOutputTokens.toString().padStart(15)}`);
    always(`  Estimated Cost:   $${totalAICost.toFixed(4).padStart(14)}`);
    
    // Monthly projection (assuming daily runs)
    const monthlyEstimate = totalAICost * 30;
    always(`  Monthly (30 runs): $${monthlyEstimate.toFixed(2).padStart(13)}`);
  }

  always("=".repeat(80));
}

export function getTimer(label: string): number | undefined {
  return timings[label]?.duration;
}

