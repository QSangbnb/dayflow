/**
 * 06 — Read a PDF.
 *
 * A PDF is just another content part. Pass a URL or a base64 data URL; the
 * `file-parser` plugin picks the engine (native for models that read PDFs
 * themselves, OCR for the rest).
 *
 *   pnpm pdf https://example.com/paper.pdf "summarise the method"
 *   pnpm pdf ./brief.pdf "what are the prizes"
 */
import { readFile } from 'node:fs/promises'
import { DEFAULT_MODEL, openrouterFetch } from '../lib/openrouter.js'

const [source = 'https://arxiv.org/pdf/1706.03762', ...rest] = process.argv.slice(2)
const question = rest.join(' ') || 'In three sentences, what does this paper propose?'

// A local path becomes a data URL; anything else is sent as a URL.
const fileData = source.startsWith('http')
  ? source
  : `data:application/pdf;base64,${(await readFile(source)).toString('base64')}`

const res = await openrouterFetch('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: question },
          { type: 'file', file: { filename: source.split('/').pop() ?? 'document.pdf', file_data: fileData } },
        ],
      },
    ],
    plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
  }),
})

if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
const body = (await res.json()) as { choices: Array<{ message: { content: string | null } }> }
console.log(body.choices[0].message.content)
