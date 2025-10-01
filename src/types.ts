// src/types.ts

export interface Feed {
  url: string;
  title: string;
}

export interface AITriageResult {
  decision: "keep" | "deprioritize" | "ignore";
  priority: "High" | "Normal" | "Low";
  topics: string[];
  reason: string;
  abstract?: string;
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
  _ai?: AITriageResult;
}

export interface FeedStats {
  total: number;
  kept: number;
  deprioritized: number;
  ignored: number;
  quality: number; // kept / total
  lastUpdated: string;
}

export interface StateStructure {
  feeds: {
    [feedUrl: string]: {
      seen: {
        [guid: string]: boolean;
      };
      stats?: FeedStats;
    };
  };
}

export interface Config {
  opmlPath: string;
  notionDbId: string;
  notionToken: string;
  pruneMaxAgeDays: number;
  perFeedHardCap: number;
  stateFile: string;
  batchSize: number;
  concurrency: number;
  maxArticleAgeDays: number;
  maxArticles: number;
  openaiApiKey: string;
  aiTriage: boolean;
  aiModel: string;
  aiMaxTokens: number;
  linkValidate: boolean;
  linkTimeoutMs: number;
  requestDelayMs: number;
  logLevel: "quiet" | "normal" | "verbose";
  autoDisableThreshold: number;
  autoDisableMinSample: number;
  globalTimeoutMinutes: number;
  aiBatchSize: number;
  aiConcurrency: number;
  aiSummary: boolean;
  aiSummaryMaxTokens: number;
}

