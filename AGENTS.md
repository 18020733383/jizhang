# Agent Instructions

## Project Overview

记账 (Jizhang) - A React-based bookkeeping app deployed on Cloudflare Pages with D1 database.

**Stack**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Cloudflare Pages Functions + D1 + Zustand

## Development Setup

### Prerequisites
- Node.js
- `GEMINI_API_KEY` in `.env.local` (copy from `.env.example`)

### Local Development (Two-Terminal Setup Required)

The app requires **both** frontend and backend running simultaneously:

```bash
# Terminal 1: Start the Pages Functions server (backend + D1)
npm run pages:dev
# Runs on :8788 with Miniflare (local D1)

# Terminal 2: Start Vite dev server (frontend)
npm run dev
# Runs on :3000, proxies /api/* to :8788
```

**Why two servers?** The `/api/*` routes are Cloudflare Pages Functions (in `functions/api/`) that need Wrangler/Miniflare to run locally. Vite's dev server proxies API calls to this backend.

### Database Migrations

```bash
# Local (Miniflare)
npm run d1:migrate:local

# Remote (Production D1)
npm run d1:migrate:remote
```

Migrations are in `migrations/`. The D1 binding name is `DB` (accessed via `env.DB` in functions).

## Build & Deploy

```bash
# Production build (outputs to dist/)
npm run build

# Deploy to Cloudflare Pages
npm run pages:deploy
```

**Critical**: Use `wrangler pages deploy`, NOT `wrangler deploy`. The latter is for Workers, not Pages.

## Key Configuration

- **Vite**: `vite.config.ts` - HMR disabled in AI Studio (`DISABLE_HMR`), `@/` alias maps to project root
- **TypeScript**: `tsconfig.json` - Path alias `@/*` maps to `./*`, `noEmit: true`
- **Wrangler**: `wrangler.toml` - Pages project with D1 binding (`database_id` must be set for deploy)
- **Build output**: `dist/` (configured in wrangler.toml and package.json)

## Project Structure

```
jizhang/
├── src/                 # React frontend
│   ├── components/      # UI components
│   ├── store/          # Zustand stores
│   └── lib/            # Utilities
├── functions/api/       # Cloudflare Pages Functions (backend)
│   └── [[path]].ts     # Catch-all API router
├── migrations/          # D1 SQL migrations
├── docs/DEPLOY.md      # Detailed deployment guide (Chinese)
└── dist/               # Build output (gitignored)
```

## Important Notes

- **HMR**: Disabled when `DISABLE_HMR=true` (AI Studio environment). File watching is disabled to prevent flickering during agent edits.
- **State Management**: Uses Zustand. App data is stored in D1, not localStorage (legacy localStorage keys are cleared on startup).
- **API Routes**: All backend logic is in `functions/api/[[path]].ts` - a single catch-all function.
- **Port Configuration**: 
  - Frontend dev server: `:3000`
  - Pages Functions dev server: `:8788`
  - API proxy: Vite forwards `/api/*` to `127.0.0.1:8788`

## Common Commands

| Task | Command |
|------|---------|
| Dev (frontend only) | `npm run dev` |
| Dev (full stack) | `npm run pages:dev` + `npm run dev` |
| Build | `npm run build` |
| Type check | `npm run lint` (runs `tsc --noEmit`) |
| Deploy | `npm run pages:deploy` |
| D1 migrate (local) | `npm run d1:migrate:local` |
| D1 migrate (remote) | `npm run d1:migrate:remote` |

## Environment Variables

- `GEMINI_API_KEY` - Required for Gemini AI API
- `APP_URL` - Injected by AI Studio for self-referential links
- `DISABLE_HMR` - Set by AI Studio to disable HMR during agent edits
