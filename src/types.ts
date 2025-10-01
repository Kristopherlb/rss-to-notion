// src/types.ts

export interface Feed {
  url: string;
  title: string;
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
}

export interface StateStructure {
  feeds: {
    [feedUrl: string]: {
      seen: {
        [guid: string]: boolean;
      };
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
}

