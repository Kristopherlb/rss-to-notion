# RSS to Notion Bridge

Automatically sync RSS feeds to a Notion database with smart pruning and deduplication.

## Features

- 📰 Reads Feedly OPML files to discover RSS feeds
- 🔄 Fetches new items across all feeds with concurrency control
- 📝 Creates one Notion page per item in your database
- 🏷️ Marks items as "Unread" by default (changeable to "Read" or "Archived")
- 🗑️ Automatically prunes old items based on age and status
- 🔢 Enforces per-feed item caps
- 💾 Maintains local cache to avoid duplicates
- ⚡ Batched API calls with retry logic for rate limits

## Requirements

- Node.js 18+ (for native fetch and top-level await)
- A Notion integration token
- A Notion database with specific properties (see below)

## Installation

```bash
npm install
```

## Configuration

### 1. Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name and select your workspace
4. Copy the "Internal Integration Token"

### 2. Set up your Notion Database

Create a Notion database with these properties:

| Property Name | Type       | Options/Values              |
|---------------|------------|-----------------------------|
| Title         | Title      | -                           |
| URL           | URL        | -                           |
| Published     | Date       | -                           |
| Source        | Select     | (auto-populated from feeds) |
| Summary       | Rich text  | -                           |
| Status        | Select     | Unread, Read, Archived      |

### 3. Share Database with Integration

1. Open your Notion database
2. Click "..." (top right) → "Connections"
3. Add your integration

### 4. Configure Environment

Copy `env.example` to `.env`:

```bash
cp env.example .env
```

Edit `.env` with your values:

```env
NOTION_TOKEN=secret_xxx
PRUNE_MAX_AGE_DAYS=30
PER_FEED_HARD_CAP=500
STATE_FILE=.rss_seen.json
BATCH_SIZE=20
CONCURRENCY=4
```

### 5. Create an OPML File

Export your RSS feeds from Feedly, NewsBlur, or any RSS reader as an OPML file.

Example `feeds.opml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>My Feeds</title>
  </head>
  <body>
    <outline text="Tech News" title="Tech News">
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://hnrss.org/frontpage" />
      <outline type="rss" text="TechCrunch" title="TechCrunch" xmlUrl="https://techcrunch.com/feed/" />
    </outline>
  </body>
</opml>
```

## Usage

### Development

```bash
npm run dev -- --opml ./feeds.opml --db YOUR_NOTION_DB_ID
```

### Production

Build and run:

```bash
npm run build
npm start -- --opml ./feeds.opml --db YOUR_NOTION_DB_ID
```

### Get your Notion Database ID

The database ID is the part of the URL after your workspace name and before the "?":

```
https://www.notion.so/myworkspace/DATABASE_ID?v=...
                                 ^^^^^^^^^^^
```

## Automation with Cron

Add to your crontab to run every 30 minutes:

```bash
# Edit crontab
crontab -e

# Add this line (adjust paths)
*/30 * * * * cd /path/to/rss-to-notion && npm start -- --opml /path/to/feeds.opml --db YOUR_DB_ID >> /var/log/rss_to_notion.log 2>&1
```

## How It Works

### Fetching

1. **Parse OPML**: Discovers all RSS feeds from your OPML file
2. **Concurrent Fetch**: Fetches feeds in parallel (controlled by `CONCURRENCY`)
3. **Deduplication**: Checks local cache to skip already-seen items
4. **Batching**: Creates Notion pages in batches (controlled by `BATCH_SIZE`)

### Pruning

The tool performs two types of pruning:

1. **Age-based**: Items with `Status=Read` older than `PRUNE_MAX_AGE_DAYS` are archived
2. **Cap-based**: Each feed keeps only the latest `PER_FEED_HARD_CAP` items (older ones archived)

### Rate Limiting

- Automatically retries on 429 (rate limit) responses
- Respects `retry_after` header from Notion API
- Batches requests to avoid overwhelming the API

## Project Structure

```
rss-to-notion/
├── src/
│   ├── index.ts      # Main entry point
│   ├── config.ts     # Configuration loading
│   ├── types.ts      # TypeScript type definitions
│   ├── state.ts      # State persistence
│   ├── opml.ts       # OPML parsing
│   ├── rss.ts        # RSS fetching
│   └── notion.ts     # Notion API operations
├── dist/             # Compiled JavaScript (generated)
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── .env              # Your configuration (create from env.example)
└── README.md         # This file
```

## Environment Variables

| Variable           | Default          | Description                                    |
|--------------------|------------------|------------------------------------------------|
| NOTION_TOKEN       | (required)       | Your Notion integration token                  |
| PRUNE_MAX_AGE_DAYS | 30               | Archive Read items older than this (days)      |
| PER_FEED_HARD_CAP  | 500              | Max items per feed (archive older)             |
| STATE_FILE         | .rss_seen.json   | Local cache file for seen items                |
| BATCH_SIZE         | 20               | Number of pages to create per batch            |
| CONCURRENCY        | 4                | Number of parallel feed fetches                |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- --opml ./feeds.opml --db YOUR_DB_ID

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

## Troubleshooting

### "Missing NOTION_TOKEN in .env"

Make sure you've created a `.env` file with your Notion integration token.

### "No feeds found in OPML"

Check that your OPML file has `<outline>` elements with `xmlUrl` attributes.

### Rate Limit Errors

Reduce `BATCH_SIZE` and `CONCURRENCY` in your `.env` file.

### Items Not Appearing

1. Verify your database is shared with the integration
2. Check that property names match exactly (case-sensitive)
3. Ensure Status has "Unread", "Read", and "Archived" as select options

## License

MIT

