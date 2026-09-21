/**
 * 03 — Structured outputs.
 *
 * Ask for JSON that matches a schema and get exactly that, validated on the
 * provider side. Pair it with zod on ours and the data is typed end to end.
 *
 *   pnpm structured
 */
import { z } from 'zod'
import { DEFAULT_MODEL, openrouter } from '../lib/openrouter.js'

// Shape and required-ness are enforced by the provider; counts are not. Strict
// mode guarantees you get `steps: string[]`, not how many — ask for that in the
// description and check it yourself if it matters.
const Brief = z.object({
  title: z.string(),
  audience: z.string(),
  steps: z.array(z.string()).describe('Three to six concrete steps, in order.'),
  risk: z.string().describe('The one thing most likely to make it fail.'),
})

const idea = process.argv.slice(2).join(' ') || 'an agent that turns a PDF into a daily voice briefing'

const completion = await openrouter.chat.completions.create({
  model: DEFAULT_MODEL,
  messages: [{ role: 'user', content: `Write a build brief for: ${idea}` }],
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'brief', strict: true, schema: z.toJSONSchema(Brief) },
  },
  // Only route to providers that honour the schema; the rest would return prose.
  // @ts-expect-error OpenRouter extension, not in the OpenAI types.
  provider: { require_parameters: true },
})

const brief = Brief.parse(JSON.parse(completion.choices[0].message.content ?? '{}'))
console.log(JSON.stringify(brief, null, 2))
