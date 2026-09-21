/**
 * 05 — Image generation.
 *
 * A dedicated endpoint, `/api/v1/images`. Pick any model whose output
 * modalities include `image` (`/api/v1/images/models` lists them), send a
 * prompt, get a file. Video and speech work the same way on their own routes.
 *
 *   pnpm image "a marble orb on warm paper, product photo"
 */
import { writeFile } from 'node:fs/promises'
import { openrouterFetch } from '../lib/openrouter.js'

const prompt = process.argv.slice(2).join(' ') || 'A bronze laurel wreath on warm paper, soft studio light.'

const res = await openrouterFetch('/images', {
  method: 'POST',
  body: JSON.stringify({
    model: process.env.OPENROUTER_IMAGE_MODEL ?? 'openai/gpt-image-1',
    prompt,
    n: 1,
    size: '1024x1024',
    output_format: 'png',
  }),
})

if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
const body = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> }

const image = body.data[0]
if (image.b64_json) {
  await writeFile('out.png', Buffer.from(image.b64_json, 'base64'))
  console.log('→ out.png')
} else {
  console.log('→', image.url)
}
