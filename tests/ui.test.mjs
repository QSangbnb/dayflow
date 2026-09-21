import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/public/app.js', import.meta.url), 'utf8')
const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8')
const inference = await readFile(new URL('../src/lib/openrouter.ts', import.meta.url), 'utf8')

test('UI exposes the complete capture-to-plan workflow', () => {
  for (const id of ['dayflow-form', 'capture-input', 'file-input', 'live-context', 'result-state', 'plan-sections']) {
    assert.match(html, new RegExp(`id="${id}"`))
  }
})

test('generated text is rendered with textContent rather than injected HTML', () => {
  assert.match(app, /textContent/)
  assert.doesNotMatch(app, /innerHTML\s*=/)
})

test('browser bundle never references the private Orbio key', () => {
  assert.doesNotMatch(html + app, /(?:ORBIO|OPENROUTER)_API_KEY/)
  assert.match(server, /process\.env\.ORBIO_API_KEY/)
})

test('inference requests use the Orbio API gateway', () => {
  assert.match(inference, /https:\/\/api\.orbio\.so\/api\/v1/)
  assert.doesNotMatch(inference, /https:\/\/openrouter\.ai\/api\/v1/)
  assert.match(inference, /Authorization: `Bearer \$\{apiKey\}`/)
})

test('server includes rate limiting, concurrency protection and request size limits', () => {
  assert.match(server, /RATE_LIMIT_MAX/)
  assert.match(server, /CONCURRENCY_MAX/)
  assert.match(server, /MAX_REQUEST_BYTES/)
})
