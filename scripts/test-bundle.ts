import { bundleProject, resolveEntry, transpile } from '../src/lib/bundle'
import { TEMPLATES, projectFromTemplate } from './fixtures/templates'

let failures = 0
function check(name: string, condition: boolean, extra?: unknown) {
  if (condition) console.log('  ok  ', name)
  else {
    failures += 1
    console.log('  FAIL', name, extra ?? '')
  }
}

for (const template of TEMPLATES) {
  const project = projectFromTemplate(template, 'Test')
  const entry = resolveEntry(project)
  check(`${template.id}: entry resolved`, Boolean(entry), entry)
  const result = bundleProject(project)
  check(`${template.id}: bundle produced`, Boolean(result))
  if (!result) continue
  if (['html', 'tsx', 'jsx', 'js'].includes(entry!.split('.').pop() ?? '')) {
    check(`${template.id}: html has importmap or scripts`, result.html.includes('<script'))
    check(`${template.id}: no unresolved relative imports`, !/from\s*["']\.\//.test(result.html))
  }
  if (result.warnings.length) console.log('     warnings:', result.warnings)
}

// React template checks
const react = projectFromTemplate(TEMPLATES.find((t) => t.id === 'react-ts')!, 'R')
const bundle = bundleProject(react)!
check('react: importmap present', bundle.html.includes('type="importmap"'))
check('react: main.tsx mapped', bundle.html.includes('https://cody.local/src/main.tsx'))
check('react: App module mapped', bundle.html.includes('https://cody.local/src/App'))
check('react: styles injected as module', bundle.html.includes('https://cody.local/src/styles.css'))
check('react: module scripts rewritten', bundle.html.includes('type="module"'))
check('react: no TS syntax left', !bundle.html.includes('useState<Item[]>'))
check('react: jsx compiled', bundle.html.includes('jsx'))
check('react: importmap before module script', bundle.html.indexOf('importmap') < bundle.html.indexOf('type="module"'))
check('react: modules crawled', bundle.modules.length >= 3, bundle.modules) 

// Vanilla template
const web = projectFromTemplate(TEMPLATES.find((t) => t.id === 'web-starter')!, 'W')
const webBundle = bundleProject(web)!
check('web: css inlined', webBundle.html.includes('<style data-cody-file="styles.css"'))
check('web: js inlined', webBundle.html.includes('app.js'))
check('web: bridge injected', webBundle.html.includes('__cody'))
check('web: counter markup kept', webBundle.html.includes('id="increment"'))

// transpile
const ts = transpile('interface A { x: number }\nconst a: A = { x: 1 }\nexport default a', 'a.ts')
check('ts: types stripped', !ts.code.includes('interface A'))
check('ts: no error', !ts.error, ts.error)

console.log(failures === 0 ? '\nAll bundle checks passed' : `\n${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
