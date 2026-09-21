import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'
import {
  attachmentContentParts,
  DayFlowPlan,
  DayFlowRequest,
  isAllowedDataUrl,
  planCounts,
  type DayFlowRequestData,
} from './lib/dayflow.js'

config({ path: ['.env.local', '.env'], quiet: true })

const PORT = Number(process.env.PORT ?? 5173)
const PUBLIC_DIR = join(process.cwd(), 'src', 'public')
const MAX_REQUEST_BYTES = 13 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const RATE_LIMIT_WINDOW_MS = 10 * 60_000
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 6)
const CONCURRENCY_MAX = Number(process.env.PAID_CONCURRENCY_MAX ?? 2)
const buckets = new Map<string, { count: number; resetAt: number }>()
let activeRequests = 0

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

class PublicError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly logMessage = message,
  ) {
    super(message)
  }
}

const server = createServer(async (req, res) => {
  setSecurityHeaders(res)

  try {
    if (!req.url || !req.method) throw new PublicError('Bad request.', 400)
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)

    if (req.method === 'POST' && url.pathname === '/api/organize') {
      await handleOrganize(req, res)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        app: 'DayFlow Agent',
        orbioKeyConfigured: Boolean(process.env.ORBIO_API_KEY ?? process.env.OPENROUTER_API_KEY),
        provider: 'Orbio',
        model: process.env.ORBIO_MODEL ?? process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5',
        capabilities: ['structured-output', 'image-understanding', 'pdf-reading', 'web-search'],
      })
      return
    }

    if (req.method === 'GET') {
      await serveStatic(url.pathname, res)
      return
    }

    throw new PublicError('Method not allowed.', 405)
  } catch (error) {
    const safe = toPublicError(error)
    console.error(`[dayflow] status=${safe.status} ${redact(safe.logMessage)}`)
    sendJson(res, safe.status, { error: safe.message })
  }
})

server.keepAliveTimeout = 120_000
server.headersTimeout = 125_000

server.listen(PORT, () => {
  console.log(`DayFlow Agent is running at http://localhost:${PORT}`)
})

async function handleOrganize(req: IncomingMessage, res: ServerResponse) {
  if (!hasValidAccessCode(req)) throw new PublicError('A valid demo access code is required.', 401)
  if (!allowRequest(req)) throw new PublicError('You have reached the demo limit. Please try again later.', 429)
  if (activeRequests >= CONCURRENCY_MAX) throw new PublicError('DayFlow is helping someone else. Try again in a moment.', 429)

  const parsed = DayFlowRequest.safeParse(await readJson(req, MAX_REQUEST_BYTES))
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message ?? 'Check your input and try again.', 400)
  if (parsed.data.attachments.some((file) => !isAllowedDataUrl(file.type, file.data))) {
    throw new PublicError('One attachment is invalid or unsupported.', 400)
  }

  activeRequests += 1
  try {
    const plan = await createPlan(parsed.data)
    sendJson(res, 200, {
      plan,
      counts: planCounts(plan),
      meta: {
        generatedAt: new Date().toISOString(),
        grounded: parsed.data.liveContext,
        attachmentCount: parsed.data.attachments.length,
      },
    })
  } finally {
    activeRequests -= 1
  }
}

async function createPlan(input: DayFlowRequestData) {
  const { DEFAULT_MODEL, openrouterFetch } = await import('./lib/openrouter.js').catch((error: unknown) => {
    throw new PublicError('The Orbio inference connection is not configured.', 503, `Orbio client import failed: ${errorMessage(error)}`)
  })

  const language = input.language === 'vi' ? 'Vietnamese' : 'English'
  const text = input.text || 'Read the attached content and turn every actionable detail into a practical plan.'
  const prompt = [
    `Today is ${input.localDateTime} in timezone ${input.timezone}.`,
    `Respond entirely in ${language}.`,
    'You are DayFlow, a personal operations agent. Convert messy real-life information into a calm, realistic action plan.',
    'Extract only information supported by the user input or attachments. Never invent dates, people, prices, locations, or commitments.',
    'Use ISO 8601 timestamps with timezone offsets when a time is known. Use null when it is not known.',
    'Put unresolved details in clarifyingQuestions instead of guessing.',
    'Keep tasks short and directly actionable. Create draft replies only when the input clearly requires a response.',
    'If live web context is enabled, search only when current public information would materially improve the plan. Copy every used URL exactly into sourceLinks.',
    'Do not provide medical, legal, financial, or emergency instructions; add a brief safety note as a task detail when professional help is appropriate.',
    `User input:\n${text}`,
  ].join('\n\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const response = await openrouterFetch('/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...attachmentContentParts(input.attachments)],
        },
      ],
      ...(input.liveContext ? { tools: [{ type: 'openrouter:web_search' }] } : {}),
      ...(input.attachments.some((file) => file.type === 'application/pdf')
        ? { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] }
        : {}),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'dayflow_plan', strict: true, schema: z.toJSONSchema(DayFlowPlan) },
      },
      provider: { require_parameters: true },
    }),
  })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PublicError('DayFlow took too long. Please shorten the input and try again.', 504, 'Orbio request timed out')
      }
      throw new PublicError('DayFlow could not reach the AI provider. Please try again.', 502, `Orbio request failed: ${errorMessage(error)}`)
    })
    .finally(() => clearTimeout(timeout))

  if (!response.ok) {
    const upstream = redact((await response.text()).slice(0, 600))
    const status = response.status === 401 || response.status === 403 ? 503 : response.status === 429 ? 429 : 502
    throw new PublicError(
      response.status === 429 ? 'The AI provider is busy. Please wait a moment and retry.' : 'DayFlow could not create a plan. Please try again.',
      status,
      `Orbio upstream status=${response.status} body=${upstream}`,
    )
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new PublicError('The AI provider returned an empty plan. Please try again.', 502)

  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    throw new PublicError('The generated plan was incomplete. Please try again.', 502, 'Structured output was not valid JSON')
  }

  const plan = DayFlowPlan.safeParse(json)
  if (!plan.success) {
    throw new PublicError('The generated plan was incomplete. Please try again.', 502, `Structured output failed validation: ${plan.error.message}`)
  }
  return plan.data
}

function hasValidAccessCode(req: IncomingMessage) {
  const expected = process.env.DEMO_ACCESS_CODE?.trim()
  if (!expected) return true
  return req.headers['x-demo-access-code'] === expected
}

function allowRequest(req: IncomingMessage) {
  const forwarded = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : ''
  const key = forwarded || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false
  bucket.count += 1
  return true
}

async function readJson(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new PublicError('The request is too large.', 413)
    chunks.push(buffer)
  }
  if (!chunks.length) throw new PublicError('Request body is required.', 400)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new PublicError('Request body must be valid JSON.', 400)
  }
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const requested = pathname === '/' ? '/index.html' : pathname
  const decoded = decodeURIComponent(requested)
  const safePath = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = join(PUBLIC_DIR, safePath)

  if (!filePath.startsWith(PUBLIC_DIR)) throw new PublicError('Not found.', 404)

  try {
    const extension = extname(filePath)
    const file = await readFile(filePath)
    res.writeHead(200, { 'content-type': mimeTypes[extension] ?? 'application/octet-stream' })
    res.end(file)
  } catch {
    await serveIndex(res)
  }
}

async function serveIndex(res: ServerResponse) {
  if (res.headersSent) return
  try {
    const html = await readFile(join(PUBLIC_DIR, 'index.html'))
    res.writeHead(200, { 'content-type': mimeTypes['.html'] })
    res.end(html)
  } catch {
    throw new PublicError('Not found.', 404)
  }
}

function setSecurityHeaders(res: ServerResponse) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  res.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=(self)')
  res.setHeader(
    'content-security-policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  )
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function toPublicError(error: unknown) {
  if (error instanceof PublicError) return error
  return new PublicError('Something went wrong. Please try again.', 500, errorMessage(error))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function redact(value: string) {
  return value.replace(/(?:sk-or-v1-|sk-orb-)[A-Za-z0-9_\-.+/=]+/g, '[redacted]').replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}
