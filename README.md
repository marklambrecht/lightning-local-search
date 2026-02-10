# Lightning Local Search

Privacy-first AI-powered search for [Obsidian](https://obsidian.md) with local vector indexing and optional Claude integration.

## Features

- **Full-text search** powered by [Orama](https://orama.com/) with support for tags, paths, dates, and fuzzy matching
- **Search term highlighting** — matching terms are highlighted in yellow within result titles and excerpts
- **Note preview on hover** — hover over any result card to see the full note via Obsidian's built-in page preview
- **Local vector embeddings** — optional semantic search using locally generated embeddings (no data leaves your machine)
- **AI-powered summaries** — optional Claude integration to ask questions about your search results
- **Editable AI prompt** — customize the question sent to Claude instead of just forwarding the search query
- **Privacy controls** — per-request consent dialogs, audit logging, and data minimization (only excerpts are sent, never full notes)

## Usage

### Search

Open the search sidebar via the ribbon icon or the command **Open Lightning Local Search sidebar**. You can also use the quick-search modal via the command **Open Lightning Local Search**.

Supported query syntax:
- Free text — `meeting notes`
- Tags — `#project #important`
- Path filters — `path:work/projects`
- Date filters — `created:>2024-01-01`, `modified:<2024-06-15`

### AI summaries

1. Enable **AI features** in plugin settings and enter your Anthropic API key
2. Search for a topic — results appear with highlighted matching terms
3. An editable textarea appears pre-filled with your search query — rewrite it to ask a longer or different question about the retrieved notes
4. Click **Ask AI** to get a summary from Claude based on the retrieved note excerpts

## Installation

### Manual

Copy `main.js`, `styles.css`, and `manifest.json` to your vault at:
```
<Vault>/.obsidian/plugins/obsidian-ai-search-plugin/
```
Then reload Obsidian and enable the plugin in **Settings > Community plugins**.

### From source

```bash
npm install
npm run build
```

## Settings

| Section | Setting | Description |
|---------|---------|-------------|
| **Search** | Maximum results | Number of results to display (5-100) |
| | Show similarity scores | Display relevance percentages on results |
| | Fuzzy search | Allow approximate matching for typo tolerance |
| | Excerpt length | Characters shown in result previews |
| **Indexing** | Excluded folders | Comma-separated folders to skip |
| | Index on startup | Auto-index when Obsidian launches |
| **Semantic search** | Enable local embeddings | Generate vector embeddings locally (~23 MB) |
| **Claude AI** | Enable AI features | Turn on Claude-powered summaries |
| | Claude API key | Your Anthropic API key |
| | Claude model | Choose between Sonnet, Haiku, or Opus |
| | Require consent per request | Show confirmation before each AI request |
| **Privacy** | Audit log | Log all AI requests and responses locally |

## Privacy

- All search indexing and vector embeddings happen locally on your device
- AI features are fully optional and disabled by default
- When AI is used, only note excerpts (not full content) are sent to Claude
- Per-request consent mode lets you review the exact data before each API call
- An optional audit log records all AI interactions locally

## Development

```bash
npm install        # Install dependencies
npm run dev        # Watch mode for development
npm run build      # Production build
```

## License

MIT
