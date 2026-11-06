/**
 * Project tree: files, folders, and the operations built on them.
 *
 * Folders can be empty, nested, renamed (moving their contents) and deleted
 * (taking their contents with them). These are the rules the Files pane relies
 * on, so they are pinned here without a DOM.
 */
import { allFolders, ancestorFolders, buildTree, childFolders, filesUnder, foldersUnder } from '../src/lib/projectTree'
import type { TreeNode } from '../src/lib/projectTree'
import type { ProjectFile } from '../src/types'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const file = (path: string): ProjectFile => ({ path, content: '' })
const shape = (nodes: TreeNode[]): string =>
  nodes
    .map((node) => (node.kind === 'folder' ? `${node.name}/[${shape(node.children)}]` : node.name))
    .join(' ')

const files = [file('index.html'), file('src/App.tsx'), file('src/lib/util.ts'), file('README.md')]

/* ---------------- folders derived from paths ---------------- */
{
  check('ancestors of a nested path', ancestorFolders('src/lib/util.ts').join(',') === 'src,src/lib')
  check('a root file has no ancestors', ancestorFolders('index.html').length === 0)
  check(
    'folders come from file paths',
    allFolders(files).join(',') === 'src,src/lib',
    allFolders(files).join(','),
  )
}

/* ---------------- declared, empty folders ---------------- */
{
  check(
    'a declared empty folder exists',
    allFolders(files, ['assets']).includes('assets'),
    allFolders(files, ['assets']).join(','),
  )
  check(
    'declaring a nested folder declares its parents',
    allFolders([], ['a/b/c']).join(',') === 'a,a/b,a/b/c',
    allFolders([], ['a/b/c']).join(','),
  )
  const tree = buildTree(files, ['assets'])
  check('empty folder shows up in the tree', shape(tree) === 'assets/[] src/[lib/[util.ts] App.tsx] index.html README.md', shape(tree))
}

/* ---------------- tree shape ---------------- */
{
  const tree = buildTree(files)
  check(
    'folders sort before files, alphabetically',
    shape(tree) === 'src/[lib/[util.ts] App.tsx] index.html README.md',
    shape(tree),
  )
  const src = tree.find((node) => node.kind === 'folder' && node.name === 'src')
  check('folder node keeps its full path', src?.kind === 'folder' && src.path === 'src')
}

/* ---------------- queries used by the UI ---------------- */
{
  check('files under a folder (deep)', filesUnder(files, 'src').length === 2)
  check('files under a folder (direct only)', filesUnder(files, 'src', false).length === 1)
  check('the root means every file', filesUnder(files, '').length === 4)
  check('folders under a folder includes itself', foldersUnder(allFolders(files), 'src').join(',') === 'src,src/lib')
  check('child folders are direct only', childFolders(allFolders(files), '').join(',') === 'src')
}

/* ---------------- rename / delete, as the app performs them ---------------- */
{
  // rename src → source: every file and folder beneath moves
  const from = 'src'
  const to = 'source'
  const rewrite = (path: string) => `${to}${path.slice(from.length)}`
  const moved = filesUnder(files, from).map((entry) => ({ ...entry, path: rewrite(entry.path) }))
  const rest = files.filter((entry) => !entry.path.startsWith(`${from}/`))
  const renamed = [...rest, ...moved]
  check('renaming a folder moves its files', renamed.some((entry) => entry.path === 'source/lib/util.ts'), renamed.map((r) => r.path).join(','))
  check('renaming a folder drops the old one', !allFolders(renamed).includes('src'))
  check('renaming a folder keeps nesting', allFolders(renamed).includes('source/lib'))

  // delete a folder: it takes its contents with it
  const doomed = filesUnder(renamed, 'source')
  const remaining = renamed.filter((entry) => !doomed.includes(entry))
  check('deleting a folder removes its files', remaining.map((entry) => entry.path).join(',') === 'index.html,README.md')
  check('deleting a folder removes the folder', allFolders(remaining, []).length === 0)

  // moving one file into a declared empty folder keeps that folder alive
  const moved1 = [...remaining, { path: 'assets/README.md', content: '' }]
  check('moving a file into a folder creates it', allFolders(moved1).includes('assets'))
}

console.log(failed === 0 ? '\nAll project tree checks passed' : `\n${failed} project tree check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
