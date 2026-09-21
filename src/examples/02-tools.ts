/**
 * 02 — Tool calling, with your own tools.
 *
 * An agent is a loop: the model asks for a tool, you run it, you hand the
 * result back, until it answers. This is that loop with nothing hidden — read
 * it once and you can write any agent.
 *
 *   pnpm tools
 */
import { z } from 'zod'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { DEFAULT_MODEL, openrouter } from '../lib/openrouter.js'

// --- tools: a schema for the model, a function for us ------------------------

/** A tool is a schema the model sees and a function we run. `defineTool` keeps the two in step. */
const defineTool = <S extends z.ZodType>(spec: {
  description: string
  schema: S
  run: (args: z.infer<S>) => Promise<unknown>
}) => spec

const tools = {
  get_time: defineTool({
    description: 'The current time in a given IANA timezone.',
    schema: z.object({ timezone: z.string().describe('e.g. Asia/Kolkata') }),
    run: async ({ timezone }) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date()),
  }),
  token_price: defineTool({
    description: 'A made-up spot price for a token symbol. Replace with a real feed.',
    schema: z.object({ symbol: z.string() }),
    run: async ({ symbol }) => ({ symbol, usd: symbol === 'ORBIO' ? 0.01 : 1 }),
  }),
}

type ToolName = keyof typeof tools

const toolDefinitions: ChatCompletionTool[] = Object.entries(tools).map(([name, tool]) => ({
  type: 'function',
  function: { name, description: tool.description, parameters: z.toJSONSchema(tool.schema) },
}))

/** Validate against the tool's own schema, then run it. Unknown tools are a model error, not ours. */
const runTool = async (name: ToolName, raw: unknown) => {
  const tool = tools[name]
  if (!tool) throw new Error(`model called unknown tool ${name}`)
  const args = tool.schema.parse(raw)
  const result = await (tool.run as (a: unknown) => Promise<unknown>)(args)
  console.log(`→ ${name}(${JSON.stringify(args)}) = ${JSON.stringify(result)}`)
  return result
}

// --- the loop ---------------------------------------------------------------

const messages: ChatCompletionMessageParam[] = [
  { role: 'system', content: 'Use tools when they help. Answer briefly.' },
  { role: 'user', content: process.argv.slice(2).join(' ') || 'What time is it in Mumbai, and what is ORBIO worth?' },
]

for (let step = 0; step < 6; step++) {
  const completion = await openrouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages,
    tools: toolDefinitions,
  })
  const message = completion.choices[0].message
  messages.push(message)

  if (!message.tool_calls?.length) {
    console.log(message.content)
    break
  }

  for (const call of message.tool_calls) {
    if (call.type !== 'function') continue
    const name = call.function.name as ToolName
    const result = await runTool(name, JSON.parse(call.function.arguments || '{}'))
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
  }
}
