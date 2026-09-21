# Orbio Build Week submission

## Project name

DayFlow Agent

## One-line description

DayFlow turns messy notes, screenshots, and PDFs into a clear daily action plan with tasks, events, reminders, and replies ready for review.

## What I built

DayFlow is a multimodal personal operations agent. A user can paste a chat message or brain dump, dictate a note, or upload screenshots and PDFs. DayFlow extracts real commitments and converts them into a typed plan: top priority, time blocks, tasks, calendar events, reminders, shopping items, draft replies, and clarification questions.

The interface lets the user complete tasks, copy the plan, export the raw JSON, and download dated items as an `.ics` calendar file. The latest plan remains available after refresh through local browser storage.

## How it works

The browser sends text and optional attachments to a small TypeScript server. The server validates request size, MIME type, and file count, then makes a multimodal chat-completions request using the Orbio-issued OpenRouter key. PDFs use the file-parser plugin. Users may enable `openrouter:web_search` when live public information would improve the plan.

The model must return a strict JSON schema. The server validates that response with Zod before the UI renders it. Unknown dates and details stay null and appear as clarification questions rather than being guessed.

## What it brings back to Orbio

DayFlow gives Orbio a relatable daily consumer use case. It demonstrates that one Orbio key can power multimodal understanding, PDF reading, optional live search, and reliable structured output inside a complete workflow rather than a generic chatbot.

The repository is public and documents the secure server-side integration, making it a reusable reference for builders who want to turn Orbio inference into dependable product actions.

## Engineering highlights

- TypeScript server with no framework dependency.
- Private server-side Orbio/OpenRouter key.
- Strict Zod request and response schemas.
- Multimodal image and PDF content parts.
- Optional live web-search tool.
- Rate limiting, concurrency cap, timeout, payload limit, and secret redaction.
- Safe DOM rendering with no generated HTML injection.
- Responsive, accessible interface.
- JSON and iCalendar exports.
- Automated schema, security, and UI regression tests.

## Demo flow

1. Open the live demo.
2. Click **Appointment message** or paste a real note.
3. Optionally upload a screenshot or PDF.
4. Enable **Live context** only if current information is relevant.
5. Click **Organize my day**.
6. Review the top priority, schedule, tasks, events, reminders, replies, and missing details.
7. Export the plan to Calendar or JSON.

## Safety

DayFlow never executes purchases, sends messages, or edits a calendar automatically. It prepares structured actions for the user to review. It does not provide medical, legal, financial, or emergency instructions.
