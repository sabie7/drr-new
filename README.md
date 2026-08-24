# Kaz Chat — Unified Source Build

**Stack:** Vue 3.5 · Tailwind CSS 4 · Vite 8 · Node 20+ · Socket.IO 4.8.3
**Developer:** Kaz alwadi (c) 2026

Professionally split source repository. Minified build files are not stored here.
Each component is generated with a single command.

## Repository Map

| Path | Description | Guide |
|------|-------------|-------|
| client/js/main-parts/ | Client chat — 28 topic parts | MANIFEST.md | 
| client/js/*.js + client/css/ | Live client units + styles | - |
| src/server-parts/ | Server — 16 topic parts | MANIFEST.md |
| cp-app/ | Control Panel (Vue 3.5 + Tailwind CSS 4) full source | - |
| cp-dist/ and dist/ | Ready-to-deploy build outputs (latest) | - |
| assets/flag/ | Country flags | - |
| client/uploads/site/ | Site identity (favicon/banner/avatar) | - |

> Heavy user media is NOT stored here — managed directly on hosting.

## Build

\ash
npm install
npm run build
npm run build:panel
\\n
| Command | Output |
|---------|--------|
| build:server | dist-server/server.ver.js + Source Map |
| build:chat   | client/dist/chat-main.ver.js prints VERSION_TOKEN |
| build:panel  | cp-dist/ complete |

## Deploy

1. Upload build outputs to hosting.
2. Update v= numbers in landing.js / index.html.
3. Hard restart.

## Maintenance Rules

- Parts are ORDERED: never reorder or renumber.
- Any client/js change requires version bump.
- Emoji requires type field (server adds it automatically).
