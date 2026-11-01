/**
 * Drafts: the plan before the workspace.
 *
 * A draft is only worth keeping if what you wrote is what the workspace gets,
 * so the interesting rules are the ones that turn text into a project —
 * markdown shape, step state, the plan file name and the ordering. Pinned here
 * without a DOM.
 */
import {
  draftMarkdown,
  draftProgress,
  draftProject,
  draftTitle,
  newDraft,
  newStep,
  planPathIn,
  sortDrafts,
} from '../src/lib/drafts'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ---------------- the shape of a draft ---------------- */
{
  const draft = newDraft()
  check('a new draft has a name', draft.title === 'Untitled plan')
  check('a new draft starts empty', draft.pitch === '' && draft.notes === '' && draft.steps.length === 0)
  check('a new draft has an id', draft.id.startsWith('d_'))
  check('a new draft is stamped', draft.createdAt > 0 && draft.updatedAt === draft.createdAt)
  check('a blank name never renders blank', draftTitle({ ...draft, title: '   ' }) === 'Untitled plan')
  check('a name is kept as typed', draftTitle({ ...draft, title: 'Pocket timer' }) === 'Pocket timer')
}

{
  const step = newStep('  wire the API  ')
  check('steps are trimmed', step.text === 'wire the API')
  check('steps start open', step.done === false)
  check('steps have their own id', step.id.startsWith('s_'))
}

/* ---------------- progress ---------------- */
{
  const draft = { ...newDraft('x'), steps: [newStep('a'), newStep('b'), newStep('c')] }
  check('an untouched plan has nothing done', draftProgress(draft).done === 0)
  check('the total counts every step', draftProgress(draft).total === 3)
  const half = { ...draft, steps: draft.steps.map((s, i) => ({ ...s, done: i === 0 })) }
  check('ticking a step moves the count', draftProgress(half).done === 1)
}

/* ---------------- ordering ---------------- */
{
  const a = { ...newDraft('a'), updatedAt: 100 }
  const b = { ...newDraft('b'), updatedAt: 300 }
  const c = { ...newDraft('c'), updatedAt: 200 }
  check('the last one touched is first', sortDrafts([a, b, c]).map((d) => d.title).join(',') === 'b,c,a')
  check('sorting does not mutate', [a, b, c].map((d) => d.title).join(',') === 'a,b,c')
}

/* ---------------- the markdown ---------------- */
{
  const draft = {
    ...newDraft('Pocket timer'),
    pitch: 'A timer that survives a locked phone.',
    notes: 'Start/stop, one job, no accounts.',
    steps: [
      { ...newStep('Rough the UI'), done: true },
      { ...newStep('Persist the deadline') },
    ],
  }
  const md = draftMarkdown(draft)
  check('the plan is a heading', md.startsWith('# Pocket timer\n'))
  check('the one-liner is a quote', md.includes('> A timer that survives a locked phone.'))
  check('the brief has its own section', md.includes('## Brief\n\nStart/stop, one job, no accounts.'))
  check('the plan has its own section', md.includes('## Plan'))
  check('a done step is a checked box', md.includes('- [x] Rough the UI'))
  check('an open step is an empty box', md.includes('- [ ] Persist the deadline'))
  check('it says where it came from', md.includes('_Drafted in Cody on '))

  const bare = draftMarkdown(newDraft('Bare idea'))
  check('an empty draft still makes a valid document', bare.startsWith('# Bare idea') && !bare.includes('## Plan'))
  check('an empty draft writes no empty quote', !bare.includes('>'))
}

/* ---------------- the workspace ---------------- */
{
  const draft = { ...newDraft('Pocket timer'), pitch: 'A timer.', steps: [newStep('Rough the UI')] }
  const project = draftProject(draft)
  check('the workspace takes the draft name', project.name === 'Pocket timer')
  check('the workspace takes the pitch', project.description === 'A timer.')
  check('the workspace holds exactly the plan', project.files.length === 1 && project.files[0].path === 'README.md')
  check(
    'the README is the plan',
    project.files[0].content.includes('## Plan') && project.files[0].content.includes('- [ ] Rough the UI'),
  )
  check('no starter markup is invented', !project.files.some((file) => file.path.endsWith('.html')))
  check('the workspace has its own id', project.id.startsWith('p_'))
  check('a nameless draft still makes a named workspace', draftProject({ ...draft, title: '' }).name === 'Untitled plan')
}

/* ---------------- PLAN.md beside the code ---------------- */
{
  check('a free workspace takes PLAN.md', planPathIn([{ path: 'index.html' }]) === 'PLAN.md')
  check('an existing plan is not overwritten', planPathIn([{ path: 'PLAN.md' }]) === 'PLAN-2.md')
  check(
    'the next free number is used',
    planPathIn([{ path: 'PLAN.md' }, { path: 'PLAN-2.md' }]) === 'PLAN-3.md',
  )
}

console.log(failed === 0 ? '\nAll draft checks passed' : `\n${failed} draft check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
