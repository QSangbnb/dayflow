import { config } from 'dotenv'
import OpenAI from 'openai'

// `.env.local` first, `.env` as a fallback. `dotenv/config` reads only `.env`,
// which is exactly the file the README tells you not to put a key in.
config({ path: ['.env.local', '.env'], quiet: true })

/**
 * Orbio exposes an OpenAI-compatible API. Keep the legacy OpenRouter variable
 * names as fallbacks so existing Render deployments continue to work.
 */
const apiKey = (process.env.ORBIO_API_KEY ?? process.env.OPENROUTER_API_KEY)
  ?.trim()
  .replace(/^Bearer\s+/i, '')

if (!apiKey) {
  throw new Error(
    'ORBIO_API_KEY is not set. Claim a key on Orbio, then copy .env.example to .env.local.',
  )
}

export const ORBIO_BASE_URL = (process.env.ORBIO_BASE_URL ?? 'https://api.orbio.so/api/v1').replace(/\/+$/, '')

export const openrouter = new OpenAI({
  apiKey,
  baseURL: ORBIO_BASE_URL,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'https://orbio.so/build',
    'X-Title': process.env.APP_NAME ?? 'DayFlow Agent',
  },
})

/** Raw fetch against the same base, for endpoints the SDK does not model. */
export const openrouterFetch = (path: string, init: RequestInit = {}) =>
  fetch(`${ORBIO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'https://orbio.so/build',
      'X-Title': process.env.APP_NAME ?? 'DayFlow Agent',
      ...(init.headers ?? {}),
    },
  })

/** A sensible default; override it with ORBIO_MODEL when needed. */
export const DEFAULT_MODEL = process.env.ORBIO_MODEL ?? process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'
