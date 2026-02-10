# Lightning Local Search — Implementation Guide

## Project overview

- **Type**: Obsidian community plugin (TypeScript + Preact, bundled to JavaScript)
- **Entry point**: `src/main.ts` compiled to `main.js` via esbuild
- **Release artifacts**: `main.js`, `manifest.json`, `styles.css`
- **UI framework**: Preact (lightweight React alternative) with hooks
- **Search engine**: Orama (full-text indexing) with optional local vector embeddings
- **AI integration**: Anthropic Claude API (optional, requires user API key)

## Environment & tooling

- **Node.js**: LTS (v18+)
- **Package manager**: npm
- **Bundler**: esbuild (`esbuild.config.mjs`)
- **Type checking**: TypeScript with `--skipLibCheck`
- **Linting**: ESLint with Obsidian plugin rules

### Commands

```bash
npm install        # Install dependencies
npm run dev        # Watch mode for development
npm run build      # Production build (tsc check + esbuild)
```

## Architecture

### Source structure

```
src/
  main.ts                     # Plugin entry point, lifecycle, command registration
  types.ts                    # All TypeScript interfaces
  settings.ts                 # Settings tab UI
  constants.ts                # Configuration constants (debounce times, view type ID)

  indexer/
    orama-index.ts            # Orama full-text search wrapper
    vault-indexer.ts           # Markdown file extraction and parsing
    query-parser.ts            # Query syntax parser (#tag, path:, created:, etc.)
    incremental-sync.ts        # File change watchers for live index updates

  claude/
    prompt-builder.ts          # Constructs Claude API prompts from search results
    claude-client.ts           # HTTP client for Anthropic API
    consent-manager.ts         # User consent modal before each AI request
    audit-log.ts               # Local request/response logging

  ui/
    search-modal.ts            # Quick-search modal (extends SuggestModal)
    search-view.ts             # Sidebar view container (extends ItemView)
    search-view-root.tsx       # Main Preact component (state, search, AI logic)
    components/
      SearchInput.tsx          # Input field with loading spinner
      ResultCard.tsx           # Individual result card with term highlighting
      ResultList.tsx           # Result list container
      AISummary.tsx            # AI response display
      ProgressBar.tsx          # Indexing progress indicator

  storage/
    cache-manager.ts           # Index persistence
    index-store.ts             # Local storage wrapper

  embeddings/
    embedding-service.ts       # Local vector embedding generation
    embedding-worker.ts        # Background embedding worker
    platform-guard.ts          # Desktop-only feature detection

  utils/
    debounce.ts                # Debounce helper
    platform.ts                # Platform detection
    text-processing.ts         # Markdown stripping, excerpt generation
```

### Key data flows

**Search flow:**
1. User types in `SearchInput` → debounced 300ms
2. Query parsed by `parseQuery()` → extracts text, tags, paths, dates
3. `oramaIndex.search()` returns ranked `SearchResult[]`
4. `ResultList` renders `ResultCard` components with highlighted terms
5. Hovering a card triggers Obsidian's `hover-link` event for page preview

**AI flow:**
1. User edits question in textarea (pre-filled with search query)
2. `buildPrompt()` packages note excerpts + custom question into a prompt
3. Optional: `ConsentManager` shows the exact data for user approval
4. `ClaudeClient` sends request to Anthropic API
5. Response displayed in `AISummary` component

### Key types

- `AISearchSettings` — all plugin configuration
- `SearchResult` — search result with path, title, score, excerpt, highlights
- `ParsedQuery` — structured query with text, tags, paths, date filters
- `ClaudeRequest` / `ClaudeResponse` — AI request/response tracking
- `SearchViewState` — UI state for the sidebar view

## Coding conventions

- TypeScript strict mode
- Preact JSX (`.tsx` files) with hooks (`useState`, `useCallback`, `useMemo`, `useRef`)
- Obsidian CSS variables for all theming (e.g., `--text-normal`, `--interactive-accent`)
- CSS classes prefixed with `ai-search-` to avoid conflicts
- Tab indentation, trailing semicolons
- `useCallback` for event handlers, `useMemo` for derived values

## Security & privacy

- Default to local/offline operation
- AI features are opt-in and disabled by default
- Only note excerpts are sent to Claude, never full content (`buildPrompt` enforces token limits)
- Per-request consent modal shows exact data before sending
- Audit log records all AI interactions locally
- API key stored in plugin settings (local `data.json`)

## Manifest rules (`manifest.json`)

- `id`: `obsidian-ai-search-plugin` (never change after release)
- `version`: Semantic Versioning `x.y.z`
- `minAppVersion`: Keep accurate when using newer Obsidian APIs
- Never use a leading `v` in release tags

## Testing

1. Run `npm run build` to compile
2. Copy `main.js`, `styles.css`, `manifest.json` to `<Vault>/.obsidian/plugins/obsidian-ai-search-plugin/`
3. Reload Obsidian and enable the plugin in **Settings > Community plugins**
4. Test search via sidebar (ribbon icon) or quick modal (command palette)
5. For AI features: configure API key in settings, search, edit the question textarea, click **Ask AI**

## Common modifications

### Adding a new search filter
1. Add regex extraction in `src/indexer/query-parser.ts`
2. Add filter field to `ParsedQuery` interface in `src/types.ts`
3. Apply filter in `src/indexer/orama-index.ts` search method

### Adding a new result card field
1. Add field to `SearchResult` interface in `src/types.ts`
2. Populate it in `src/indexer/orama-index.ts`
3. Render it in `src/ui/components/ResultCard.tsx`

### Modifying the AI prompt
1. Edit system prompt or user message template in `src/claude/prompt-builder.ts`
2. The `customQuestion` parameter overrides the query line sent to Claude

### Adding new settings
1. Add field to `AISearchSettings` in `src/types.ts`
2. Add default value in `src/constants.ts`
3. Add UI control in `src/settings.ts`

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json`
- Create a GitHub release whose tag exactly matches the version (no `v` prefix)
- Attach `manifest.json`, `main.js`, and `styles.css` to the release

## References

- Obsidian API docs: https://docs.obsidian.md
- Obsidian developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Orama search engine: https://orama.com/
- Preact: https://preactjs.com/
- Anthropic Claude API: https://docs.anthropic.com/
