#!/usr/bin/env node
/**
 * Cody test runner.
 *
 * 1. bundle  — the in-browser bundler against every template
 * 2. render  — server-side render of every screen (catches component crashes)
 * 3. preview — executes a bundled preview in jsdom (scripts + console bridge)
 * 4. smoke   — mounts the real app in jsdom and walks the core flows
 *
 * Vite-only features (`?worker` imports) are stubbed for node execution.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const workerStub = {
  name: 'worker-stub',
  setup(buildApi) {
    buildApi.onResolve({ filter: /\?worker$/ }, () => ({
      path: resolve(root, 'scripts/stubs/worker-stub.js'),
    }))
  },
}

const suites = [
  { name: 'bundle', entry: 'scripts/test-bundle.ts', format: 'esm', out: '.test-bundle.mjs', plugins: [] },
  { name: 'render', entry: 'scripts/test-render.tsx', format: 'cjs', out: '.test-render.cjs', plugins: [workerStub] },
  {
    name: 'preview',
    entry: 'scripts/test-preview.tsx',
    format: 'cjs',
    out: '.test-preview.cjs',
    plugins: [workerStub],
    externals: ['jsdom'],
  },
  {
    name: 'syntax',
    entry: 'scripts/test-syntax.ts',
    format: 'esm',
    out: '.test-syntax.mjs',
    plugins: [],
  },
  {
    name: 'actions',
    entry: 'scripts/test-actions.ts',
    format: 'esm',
    out: '.test-actions.mjs',
    plugins: [],
  },
  {
    name: 'completions',
    entry: 'scripts/test-completions.ts',
    format: 'esm',
    out: '.test-completions.mjs',
    plugins: [],
  },
  {
    name: 'tree',
    entry: 'scripts/test-tree.ts',
    format: 'esm',
    out: '.test-tree.mjs',
    plugins: [],
  },
  {
    name: 'diagnostics',
    entry: 'scripts/test-diagnostics.ts',
    format: 'esm',
    out: '.test-diagnostics.mjs',
    plugins: [],
  },
  {
    name: 'styles',
    entry: 'scripts/test-styles.ts',
    format: 'esm',
    out: '.test-styles.mjs',
    plugins: [],
  },
  {
    name: 'smoke',
    entry: 'scripts/test-app.tsx',
    format: 'cjs',
    out: '.test-smoke.cjs',
    plugins: [workerStub],
    externals: ['jsdom'],
  },
]

let failed = 0

for (const suite of suites) {
  const outfile = resolve(root, suite.out)
  await build({
    entryPoints: [resolve(root, suite.entry)],
    bundle: true,
    platform: 'node',
    format: suite.format,
    outfile,
    logLevel: 'error',
    external: suite.externals ?? [],
    plugins: suite.plugins,
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.svg': 'dataurl' },
  })
  console.log(`\n▸ ${suite.name}`)
  const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit', cwd: root })
  if (result.status !== 0) failed += 1
}

console.log(failed === 0 ? '\n✓ all suites passed' : `\n✗ ${failed} suite(s) failed`)
process.exit(failed === 0 ? 0 : 1)
