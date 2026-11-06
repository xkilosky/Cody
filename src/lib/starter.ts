/**
 * What a new workspace is.
 *
 * No gallery, no template menu: one predictable starting point — three plain
 * files, no framework and no dependencies. Delete them and the workspace is
 * empty; leave them and it already runs in the preview.
 */
import type { Project } from '../types'
import { uid } from './utils'

/** The three files every new workspace begins with, in order. */
export const STARTER_FILES = ['index.html', 'styles.css', 'app.js'] as const

const html = (name: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(name)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <p class="eyebrow">New workspace</p>
      <h1>${escapeHtml(name)}</h1>
      <p>Edit this file, then tap Run.</p>
      <button id="ping" type="button">Ping</button>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`

const css = `:root {
  color-scheme: light dark;
  --ink: #0f1012;
  --paper: #fbfbfc;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}

main {
  width: min(90vw, 30rem);
  padding: 2rem 0;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.55;
}

h1 {
  margin: 0.35rem 0 0.75rem;
  font-size: 1.9rem;
  letter-spacing: -0.02em;
}

button {
  margin-top: 0.5rem;
  padding: 0.7rem 1.1rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
}
`

const js = `const button = document.getElementById('ping')
let pings = 0

button.addEventListener('click', () => {
  pings += 1
  button.textContent = pings === 1 ? 'Pinged once' : \`Pinged \${pings} times\`
  console.log('ping', pings)
})
`

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
    return map[character]
  })
}

/** A fresh workspace: `index.html` + `styles.css` + `app.js`, ready to run. */
export function blankProject(name = 'Untitled'): Project {
  const now = Date.now()
  const title = name.trim() || 'Untitled'
  return {
    id: uid('p_'),
    name: title,
    description: 'Plain starter',
    entry: 'index.html',
    files: [
      { path: 'index.html', content: html(title) },
      { path: 'styles.css', content: css },
      { path: 'app.js', content: js },
    ],
    createdAt: now,
    updatedAt: now,
  }
}
