/**
 * 01 — Chat, streamed.
 *
 * The smallest useful thing: a question in, tokens out as they arrive. Every
 * other example is this call with more arguments.
 *
 *   pnpm chat
 */
import { DEFAULT_MODEL, openrouter } from '../lib/openrouter.js'

const question = process.argv.slice(2).join(' ') || 'In two sentences, what is an inference credit?'

const stream = await openrouter.chat.completions.create({
  model: DEFAULT_MODEL,
  stream: true,
  messages: [
    { role: 'system', content: 'You are terse and precise.' },
    { role: 'user', content: question },
  ],
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
}
process.stdout.write('\n')
