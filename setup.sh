#!/bin/bash
# Setup script for RSS to Notion Bridge

set -e

echo "🥷🏻 Setting up RSS to Notion Bridge..."
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ required. You have $(node -v)"
  exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo ""
  echo "📝 Creating .env file from template..."
  cp env.example .env
  echo "⚠️  Please edit .env and add your NOTION_TOKEN"
else
  echo ""
  echo "✅ .env file already exists"
fi

# Build the project
echo ""
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your NOTION_TOKEN"
echo "2. Create or export an OPML file with your RSS feeds"
echo "3. Set up your Notion database (see README.md)"
echo "4. Run: npm start -- --opml ./feeds.example.opml --db YOUR_NOTION_DB_ID"
echo ""

