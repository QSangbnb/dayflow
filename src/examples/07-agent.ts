/**
 * 07 — A small agent that does a job on a schedule.
 *
 * Everything above, composed: it searches the web (server tool), turns what it
 * finds into a typed brief (structured output), and would post it somewhere
 * (your tool). Run it under cron, a Trigger.dev task, or a Telegram bot's
 * message handler and it is a product.
 *
 *   pnpm agent "tokenised equities on Robinhood Chain"
 */
import { z } from 'zod'
import { DEFAULT_MODEL, openrouterFetch } from '../lib/openrouter.js'

const Digest = z.object({
  headline: z.string(),
  bullets: z.array(z.string()).describe('Three to five, each one fact.'),
  sources: z.array(z.url()).describe('One URL per entry, copied exactly from the notes.'),
})

const topic = process.argv.slice(2).join(' ') || 'tokenised equities on Robinhood Chain'

// 1. Research with a server tool. The model decides how many searches to run.
const research = await openrouterFetch('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: `Research the last 7 days of news on: ${topic}. Keep every URL you use.` }],
    tools: [{ type: 'openrouter:web_search' }],
  }),
})
if (!research.ok) throw new Error(`${research.status} ${await research.text()}`)
const notes = ((await research.json()) as { choices: Array<{ message: { content: string } }> }).choices[0].message.content

// 2. Shape it. A schema is a contract with whatever consumes the digest next.
const shaped = await openrouterFetch('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: 'Turn research notes into a digest. Only use URLs present in the notes, one per entry, verbatim.' },
      { role: 'user', content: notes },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'digest', strict: true, schema: z.toJSONSchema(Digest) },
    },
    provider: { require_parameters: true },
  }),
})
if (!shaped.ok) throw new Error(`${shaped.status} ${await shaped.text()}`)
const digest = Digest.parse(
  JSON.parse(((await shaped.json()) as { choices: Array<{ message: { content: string } }> }).choices[0].message.content),
)

// 3. Deliver. Replace with a Telegram send, an X post, an email, a webhook.
await deliver(digest)

async function deliver(d: z.infer<typeof Digest>) {
  console.log(`\n# ${d.headline}\n`)
  for (const b of d.bullets) console.log(`- ${b}`)
  console.log(`\nSources:\n${d.sources.map((s) => `  ${s}`).join('\n')}`)
}
