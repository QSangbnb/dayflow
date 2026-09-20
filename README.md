# DayFlow Agent

**Drop the chaos. Get your day back.**

DayFlow is a multimodal personal operations agent built for Orbio Build Week. It turns unstructured notes, screenshots, and PDFs into a predictable daily plan containing tasks, events, reminders, shopping items, clarifying questions, and replies ready for human review.

## Why it exists

Useful commitments are often trapped in chat messages, screenshots, booking PDFs, and hurried voice notes. Moving those details into a calendar or task app is repetitive work, so people postpone it and forget things.

DayFlow performs that translation in one step:

```text
messy input → multimodal understanding → typed plan → human review → action
```

It is deliberately not a general chatbot. The output follows a strict schema so the interface can turn it into checkable tasks, calendar events, reminders, lists, and draft replies.

## Features

- Text capture for messages, notes, and brain dumps.
- Browser voice dictation when supported.
- Drag-and-drop JPEG, PNG, WebP, and PDF input.
- Orbio-powered multimodal understanding.
- Optional live web grounding when current context is genuinely useful.
- Strict structured output validated with Zod.
- Tasks with priority, due time, duration, and completion state.
- Events with location and preparation lists.
- Reminders, shopping lists, and replies ready for review.
- Explicit clarification questions instead of invented details.
- Copyable plain-text plan, JSON export, and `.ics` calendar export.
- Privacy-first local persistence for the latest plan.
- Responsive UI with no account required for the public demo.

## How Orbio is used

The project uses the Orbio-issued OpenRouter key entirely on the server. A single request can combine:

- model inference;
- image understanding;
- PDF parsing through the file-parser plugin;
- optional `openrouter:web_search` grounding;
- strict JSON-schema output.

This gives Orbio an everyday consumer use case rather than another chat surface. DayFlow demonstrates how one Orbio key can power a complete capture-to-action workflow and produce output that downstream software can reliably consume.

## Architecture

```text
Browser
  ├─ text / voice / image / PDF capture
  ├─ local latest-plan persistence
  └─ task, calendar and export UI
          │
          ▼
Node.js HTTP server
  ├─ input and MIME validation
  ├─ per-client rate limiting
  ├─ paid-request concurrency cap
  ├─ optional demo access code
  └─ secret-key redaction
          │
          ▼
Orbio-issued key → OpenRouter models and tools
```

The browser never receives `OPENROUTER_API_KEY`. Uploaded content is passed to the inference request and is not written to disk or a database by this application.

## Local setup

Requirements:

- Node.js 22+
- pnpm
- An Orbio-issued OpenRouter key

Install and configure:

```bash
pnpm install
cp .env.example .env.local
```

Set at least:

```env
OPENROUTER_API_KEY=your_orbio_issued_key
APP_NAME=DayFlow Agent
APP_URL=http://localhost:5173
```

Run locally:

```bash
pnpm dev
```

Open `http://localhost:5173`.

## Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

## Production environment

Required:

```env
OPENROUTER_API_KEY=
```

Optional:

```env
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
APP_NAME=DayFlow Agent
APP_URL=https://your-app.example
PAID_CONCURRENCY_MAX=2
RATE_LIMIT_MAX=6
DEMO_ACCESS_CODE=
PORT=5173
```

The health check is available at `GET /api/health` and never exposes the key.

## Safety and privacy

- The Orbio key is server-only.
- Input size and attachment count are capped.
- Attachment MIME type must match its data URL.
- Only supported image formats and PDFs are accepted.
- Generated output is schema-validated before it reaches the browser.
- User content is rendered with DOM `textContent`, not injected HTML.
- External sources are opened only for validated HTTP(S) URLs.
- The agent is instructed not to invent missing commitments or dates.
- Human review is required before using replies or acting on a plan.
- Rate limiting and concurrency controls protect promotional inference credits.

## Build Week

The original ChainBrief project is preserved at tag `chainbrief-v1-final` and branch `archive/chainbrief-v1`. DayFlow is the new public Build Week entry.

See [`SUBMISSION.md`](./SUBMISSION.md) for the concise project write-up.

## License

MIT
