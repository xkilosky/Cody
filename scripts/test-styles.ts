/**
 * Stylesheet integrity.
 *
 * The UI is plain CSS, so a bad edit can silently delete a whole section of
 * rules — nothing type-checks, nothing throws, the screen just falls apart.
 * This suite asserts that every component's load-bearing selectors still exist,
 * and that the file has not shrunk the way an over-broad edit makes it shrink.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// bundled to the repo root by scripts/run-tests.mjs; run directly from scripts/
const here = dirname(fileURLToPath(import.meta.url))
const root = here.endsWith('scripts') ? resolve(here, '..') : here
const css = readFileSync(join(root, 'src/styles.css'), 'utf8')

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Selectors that each screen and sheet depends on. If one disappears the UI breaks. */
const REQUIRED = [
  // shell + navigation
  '.app-root', '.app-header', '.project-shell', '.tab-bar', '.tab-btn',
  // editor pane chrome
  '.code-pane', '.editor-tabs', '.tab-chip', '.tab-chip-main', '.tab-name', '.tab-close',
  '.dirty-dot', '.tabs-more', '.lang-icon', '.editor-host', '.editor-status', '.status-lang',
  '.status-save', '.editor-toolbar', '.rail-row', '.rail-actions', '.rail-keys', '.tool-btn',
  '.rail-key', '.rail-run', '.symbol-grid', '.symbol-key',
  // panes
  '.pane', '.pane-toolbar', '.file-row', '.file-row-main', '.file-row-wrap', '.file-name',
  '.run-pane', '.console', '.console-area', '.log-row', '.log-text', '.log-time', '.log-source',
  // switcher + templates
  '.switcher-list', '.switcher-row', '.switcher-main', '.switcher-emoji', '.switcher-text',
  '.current-pill', '.template-list', '.template-row', '.project-meta',
  // generic controls
  '.chip', '.chip-row', '.field-label', '.text-input', '.search-field', '.clear-btn',
  '.segmented', '.count-badge', '.spinner', '.pill', '.icon-btn',
  // sheets, settings, toasts, cody panel
  '.sheet', '.sheet-layer', '.sheet-scrim', '.sheet-grabber', '.sheet-quick-actions',
  '.setting-row', '.switch', '.toast', '.toast-stack', '.cody-pane', '.cody-hero',
  '.snippet-card', '.runtime-row', '.action-list', '.action-item', '.empty-state',
]

for (const selector of REQUIRED) {
  check(`css has ${selector}`, css.includes(`\n${selector} `) || css.includes(`\n${selector},`) || css.includes(`\n${selector}{`) || css.includes(`\n${selector}:`))
}

/** Every `className="…"` literal in the components should resolve to a rule. */
const components = readdirSync(join(root, 'src/components'))
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => readFileSync(join(root, 'src/components', file), 'utf8'))
  .join('\n')
  .concat(readFileSync(join(root, 'src/App.tsx'), 'utf8'))

const literals = new Set<string>()
// semantic hooks that intentionally carry no styles
const HOOK_ONLY = new Set(['files-pane'])

for (const match of components.matchAll(/className="([^"{}\n]+)"/g)) {
  for (const token of match[1].split(/\s+/)) {
    if (/^[a-z][a-z0-9-]*$/.test(token) && !HOOK_ONLY.has(token)) literals.add(token)
  }
}

const unstyled = [...literals].filter((token) => !new RegExp(`\\.${token}(?![a-z0-9-])`).test(css))
check('every literal className has a rule', unstyled.length === 0, unstyled.join(', '))

const rules = (css.match(/\{/g) ?? []).length
check(`stylesheet still has its bulk (${rules} rules)`, rules > 240, 'the stylesheet lost whole sections')

console.log(failed === 0 ? '\nAll style checks passed' : `\n${failed} style check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
