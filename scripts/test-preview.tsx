/**
 * Executes a generated preview document in jsdom (with scripts enabled) to prove
 * the bundled HTML actually runs: markup, inlined JS, console bridge and events.
 */
import { JSDOM } from 'jsdom'
import { bundleProject } from '../src/lib/bundle'
import { TEMPLATES, projectFromTemplate } from '../src/lib/templates'

const checks: Array<[string, boolean, string?]> = []
const check = (label: string, ok: boolean, extra?: string) => checks.push([label, ok, extra])
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const project = projectFromTemplate(TEMPLATES.find((t) => t.id === 'web-starter')!, 'Preview test')
  const bundle = bundleProject(project, { entry: 'index.html' })
  check('bundle produced', Boolean(bundle))
  if (!bundle) return finish()

  const messages: Array<Record<string, unknown>> = []
  const dom = new JSDOM(bundle.html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://cody.test/preview',
    beforeParse(window) {
      // Capture the postMessage bridge as the parent window would.
      window.parent.postMessage = (data: unknown) => {
        messages.push(data as Record<string, unknown>)
      }
    },
  })

  await wait(200)

  const doc = dom.window.document
  const count = doc.getElementById('count')
  check('markup rendered', Boolean(count))
  check('inline stylesheet applied', doc.querySelectorAll('style').length > 0)
  check('inlined app script ran', (dom.window as unknown as { count?: unknown }).count !== undefined || Boolean(count?.textContent))
  check('initial counter value', count?.textContent === '0', count?.textContent ?? '')
  check('bridge reported console output', messages.some((message) => message.kind === 'console'))
  check('bridge reported ready', messages.some((message) => message.kind === 'ready'))

  const increment = doc.getElementById('increment')!
  increment.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await wait(60)
  check('counter incremented on click', count?.textContent === '1', count?.textContent ?? '')
  check('hint text updated', (doc.getElementById('hint')?.textContent ?? '').includes('one tap'))
  check('console message forwarded', messages.some((message) => String(message.text ?? '').includes('Cody web starter')))

  dom.window.close()
  finish()
}

function finish() {
  let failures = 0
  for (const [label, ok, extra] of checks) {
    if (ok) console.log('  ok  ', label)
    else {
      failures += 1
      console.log('  FAIL', label, extra ?? '')
    }
  }
  console.log(failures === 0 ? '\nAll preview checks passed' : `\n${failures} preview checks failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.log('FAILED', error)
  process.exit(1)
})
