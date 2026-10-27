# Cody

**A mobile-first, multi-language project editor — build entire software projects from your phone.**

Cody is a complete coding environment that fits in a phone browser (and installs as a PWA).
It gives you a file tree, a fast touch-friendly code editor, live previews that bundle in the
browser, real Python in the browser, a cloud sandbox for compiled languages, and one-tap export
of a runnable project.

**It opens as an editor, not a landing page.** Cold start drops you straight into a workspace with
the code on screen — no hero, no marketing, no empty dashboard. Workspaces, imports and settings
live in a switcher sheet one tap (or `⌘K` / `Ctrl+K`) away, and the app remembers the workspace you
were in.

No backend. No install step. No account. Projects are stored on the device (IndexedDB) and
nothing leaves it unless you explicitly run a cloud-sandbox language.

![Cody's editor on a phone, dark and light](docs/cody-editor.png)

---

## Why it exists

Desktop editors assume a keyboard and three panes of screen. Cody assumes a thumb:

- **Editor first** — boot lands in the code, not a dashboard. The workspace switcher is a sheet
  over the editor, so switching projects never costs you your screen.
- **One-handed navigation** — a 4-tab bottom bar (Files · Code · Run · Build) instead of a
  cramped sidebar, with every primary action inside the bottom third of the screen.
- **A keyboard for people without a keyboard** — a symbol rail (`{} () [] => ; $`) plus
  language-aware insert keys (`def `, `fn `, `useState(` …), undo/redo, comment toggle, find.
- **Previews that actually run your code** — Cody transpiles TypeScript/JSX with Sucrase and
  resolves imports to blob modules inside a generated HTML shell, so `import App from './App'`
  works with no bundler server.
- **Polyglot or nothing** — **45 languages** highlight out of the box and **38 of them run**;
  browser languages, Python and cloud languages each take an appropriate execution path.
- **Never lose work** — autosave on every pause, offline app shell, ZIP / JSON export, backup all.

---

## Features

### Editing
- CodeMirror 6 editor tuned for touch: line wrapping by default, no iOS zoom (16px+ inputs),
  indent / outdent / comment / undo / redo / find in a persistent toolbar.
- Editor chrome modelled on the best phone editors (Spck, Acode) and then tightened:
  **file tabs**, a quiet **line-number gutter** with the active line highlighted, a
  **status strip** (`Ln 14, Col 21 · 34 lines · TSX · Spaces: 2 · Saved`) and a two-row
  **keyboard rail** — actions with a pinned Run on top, a scrollable symbol row below, docked
  against the OS keyboard instead of floating over your code.
- Lazy-loaded grammars for **45 languages** (JavaScript, TypeScript, TSX/JSX, HTML, CSS, JSON,
  Markdown, Python, SQL, XML/SVG, YAML, TOML, Shell, C, C++, Java, C#, Go, Rust, PHP, Ruby, Lua,
  Swift, Kotlin, Dockerfile, Diff, plain text — plus Dart, Scala, Haskell, Erlang, Julia, OCaml,
  F#, Perl, R, Groovy, Clojure, Elm, D, Pascal, Fortran, COBOL and Octave/MATLAB). Every grammar
  is its own chunk, so a phone only downloads the one it opens.
- Live theme (dark/light), font size 11–22px, tab size, line numbers, mono/serif, haptics.
- Autocomplete, bracket matching, bracket closing, multi-cursor, search panel, fold-aware editing.

### Workspaces & files
- First launch creates a runnable plain workspace (HTML + CSS + JS) and opens `index.html`.
- Workspace switcher (header chevron or `⌘K`): open, create, duplicate, rename, delete, import,
  theme, settings — all as sheets over the editor.
- **No template gallery.** A new workspace is a name and one button: it starts as three plain files
  (`index.html`, `styles.css`, `app.js`) that already run, and you delete or add from there. The
  sheet spells the starter out before you commit, so nothing is a surprise.
- **Folders are real objects**, not just path prefixes: create one with **Files → New → New folder**,
  and it stays even while empty (it lives in `project.folders`). Every folder row has its own
  actions: new file here, new folder inside, rename (contents move with it), duplicate (copies the
  whole subtree), collapse/expand and delete (with a warning that lists what will be lost).
- **File operations**: create (root or inside a folder), read, rename/move by path, **move to a
  folder…**, duplicate, delete (with confirmation), and set as project entry.
- **Project operations**: create (name only), open, duplicate, rename (switcher or header), delete
  (from the project menu) — plus the file tree's own count badge, search filter and problem marks.
- **Find in files** across the whole workspace — grouped results with the matched line, tap to jump,
  match-case and regex, and a confirmed **Replace all** that writes every changed file at once.
- Import loose files (multi-select), import a whole folder (`webkitdirectory`), or import a
  `.cody.json` project file.
- Export a **ZIP** (dependency-free ZIP writer, no libraries) or a portable JSON project, and use
  the native share sheet where the browser supports `navigator.share` with files.

### Running
| Runtime | Languages | How |
| --- | --- | --- |
| Browser preview | HTML/CSS/JS, TS/TSX/JSX, SVG, React, Three.js | Sucrase transpile + import map + blob modules in an `iframe srcdoc` |
| Python | `.py` | Pyodide (CPython → WASM) in a Web Worker, streamed stdout/stderr |
| Cloud sandbox | C, C++, Java, Go, Rust, PHP, Ruby, Lua, Swift, Kotlin, C#, SQL, Shell, **Dart, Scala, Haskell, Erlang, Julia, OCaml, F#, Perl, R, Groovy, Clojure, Elm, D, Pascal, Fortran, COBOL, Octave/MATLAB** | Piston-compatible API (`Settings → Runner`), configurable endpoint |
| Not runnable | JSON, YAML, Markdown, Dockerfile… | Edited and exported only |

- **Console bridge**: `console.log/warn/error`, uncaught errors and unhandled rejections from the
  preview are piped into Cody's console panel with timestamps and source tags.
- Cloud runs support **stdin** and show compile errors separately from runtime output.
- Opt-in **auto re-run** rebuilds the preview shortly after you stop typing.
- Configurable runner endpoint + a "Test" button that lists available runtimes.
- **When the runner has no runtime for the language**, the console says so by name and points at
  `Settings → Runner → Test` instead of leaving you with an opaque 400.

### Mobile / PWA
- Installable (manifest + icons + service worker), `100dvh` layout, safe-area padding for the
  notch and home indicator, sticky header, bottom sheets instead of modals, toast feedback.
- Offline: the app shell and assets are cached; all project data is local.
- Responsive: single column on phones, wider centred column with side borders on tablets/desktop.

### Build assist ("Build" tab)
- Curated, offline snippet library (37 snippets) filtered by the language of the file you are
  editing — insert at the cursor or scaffold a new file.
- Project health at a glance: file/language/runnable counts and each language's runtime.

### Build AI ("AI" tab)

A fifth tab that turns the editor into an agent workspace. It is **BYOK**: there is no Cody account
and no Cody server, so you paste your own key — for a free tier, or for a provider you already pay
for (OpenRouter, xKiro, Groq, Mistral, Cerebras, Google Gemini, DeepSeek, Together, OpenAI,
Anthropic, xAI, or any OpenAI-compatible endpoint such as Ollama, LM Studio or vLLM).

- **Free models only, by default.** Cody will not call a model that costs money unless you pin one
  by hand. Free means: an OpenRouter `:free` model, any model on a provider whose free tier covers
  it (Groq, Cerebras), the free plan models (Gemini Flash, Mistral Small), or a model running on
  your own machine. Providers with a free path are marked in AI settings, and a *Free models only*
  switch turns the rule off when you want the bigger models.
- **The catalog decides what is free.** A gateway can run dozens of free models behind
  `vendor/model` ids that no hard-coded table could list — xKiro marks 47 of its 97 that way
  (`access_tier: free`, or `pricing` at zero). Cody reads that catalog once per session (cached
  24 h), registers those ids as free, and *then* selects. Before this, a free-only setup with an
  xKiro key had nothing it was allowed to call: every curated xKiro id is a paid flagship, so
  selection produced zero candidates and the provider was never touched. The AI sheet loads each
  keyed provider's catalog when it opens, shows *“47 free models found”* on the card, lists those ids
  first in the picker, and has a **Use xKiro first** button — a provider you cannot choose is a
  provider you cannot use.
- **Automatic model selection.** The preferred provider is the head of the list; every other
  provider that has a key follows. The model for each job is picked by tier (reasoning for the
  planner, code for the coders, fast for the tester) *within the free set*, and `/models` discovery
  is what keeps the ids honest — the curated list is only a starting point. If nothing free is
  configured, the app says so plainly ("no free model · paid") instead of quietly spending.
- **Retired ids recover themselves.** A hard-coded id goes stale (Google's `gemini-3-flash` became
  a 404). When every candidate for a provider comes back "model not found", Cody asks that
  provider's `/models` what it actually serves, ranks the answer best-first (small and preview
  variants demoted, newest version first), keeps the free rule — a Google Flash counts as free, a
  Pro does not — and answers the turn with a real id. The list is remembered for the session, so it
  costs one extra request, not one per turn.
- **Failover.** A rejected or out-of-credit key cools the whole provider for a minute and the run
  continues on the next one; a retired model (404) is remembered for five minutes; a rate limit
  costs one retry. Pressing *Stop* is not a failure and never triggers a fallback.
- **Models that insist on function calling.** Tool calls here are a fenced ```` ```tool ```` block in
  the reply, so no `tools` array is ever sent. Some models — Groq's gpt-oss above all — reach for a
  native tool call anyway, and Groq then refuses the entire request (`400 tool_use_failed`, "Tool
  choice is none, but model called a tool"). Cody appends a note that spells the text protocol out
  and retries the same model once; if it happens again the model is remembered, later turns start
  with the note already in place, and the run moves on to the next candidate instead of dying.
- **Chat.** One assistant, the same tools, minimal chrome. It reads, writes and patches the real
  files, and each change is a chip you can follow. Answers render as light markdown — bold, lists,
  inline and fenced code, http(s) links — through a ~150-line renderer with no dependency and no
  `dangerouslySetInnerHTML`, so a model that writes `<img onerror=…>` just prints those characters.
  The label models copy off their own transcript (`[Cody] …`, `[Coder A] …`) and any restatement of
  a tool result (`[Tool Output] …`) are cut before the bubble.
- **Crew.** Four agents work through a project in order — Planner, Coder A, Coder B, Tester — each
  able to run on a different provider. Coder B reviews what Coder A actually wrote; the Tester runs
  the real parsers (`check_problems`) and the real bundler (`run_preview`), reads the console, and
  patches until it passes or reports `FAIL:`. The run stops when the Tester finishes, and a
  per-run tool budget stops a loop that will not converge.
- **Tools, not chat.** 21 tools: list/create/open/rename/delete workspaces, list/read/create/write/
  patch/delete/rename files, create/delete/rename folders, move files, set the entry file, check
  problems, run the preview, read the console. `patch_file` refuses an ambiguous `find` unless you
  pass `all: true`, and paths that try to escape the project are rejected.
- **Consent.** Writes run by default; *Ask before writing* routes every one through a sheet, and a
  refusal is told to the model instead of silently ignored. Every crew run is snapshotted so you can
  put the project back.
- **Keys stay out of your files.** They live in `localStorage` under their own key, never in the
  project, the ZIP, the JSON export or a backup.

### Find in files
The Files tab's box filters **names**; this answers the other question — *where is this used?*
Open it from the search button in the Files toolbar, **Find in files…** in the project menu, or
`⌘⇧F` / `Ctrl⇧F`.

- **Every file is searched at once**, and results are grouped by file with the line number and the
  matching code — the match itself is highlighted, and the preview is a window around it, not the
  start of the line (so deeply indented code still reads).
- **Grouped and ordered by how much a file uses the word**, so the file that defines something is
  usually the first one.
- **Tap any result** to open that file with the caret already on the match, from whichever tab you
  started in.
- **`Aa` and `.*`** switch on match-case and regular expressions. The pattern is anchored to nothing
  and the search is literal until you ask for regex, so `a.b` means the three characters.
- **Replace all** is a second step behind a confirmation that names the count
  (`Replace 7 in 2 files`): it writes every changed file, reports what it changed, and the editor
  (if the file is open) picks up the new text immediately.
- **Cheap by construction**: a single pass per file, zero-length matches are stepped over so a
  pattern like `z*` cannot hang, and the result set stops early (200 matches) so a query that
  matches everywhere still paints instantly.

The matcher, the preview window and the replacement live in `src/lib/search.ts` — pure, offline, and
covered by its own suite (50 checks) next to the diagnostics and code-action ones.

### Smart completions
- **Suggestions built from your own code.** As you type, Cody offers the variables, functions,
  classes and types this file declares — with their signatures — plus keywords, and the exports of
  every other file in the project (tagged with `./src/utils.ts` so you know where it comes from).
- **Members after a dot.** `cart.` offers what `Cart` declares; `items.` knows it is an array;
  `title.` offers string methods; `user.` offers the object literal's keys; `this.` offers the
  enclosing class; `document.` / `console.` / `Math.` / `JSON.` / `res.` (a promise) all resolve.
  An unknown receiver still lists every member the file declares instead of nothing.
- **Quiet in the wrong places.** No suggestions inside strings or comments, and none in markup or
  data files, where the HTML/CSS/JSON language packages already do a better job.
- **Touch-sized.** Rows are 9px-padded with the signature right-aligned, capped at 38vh so the
  keyboard stays visible, and there is a ✨ button in the editor rail for when the phone keyboard
  has no `Ctrl-Space`.
- **How it works.** `src/editor/completions.ts` blanks out strings and comments (offsets preserved),
  scans for declarations and class/object members, resolves the receiver left of the dot, and ranks
  by prefix. Pure and offline: no type checker, no server, no telemetry.

### Code actions (the lightbulb)
Everything a quick fix or refactor needs is computed from the buffer, the caret and the project — all
offline, all undoable in one step. **✨/bulb button in the editor rail**, or `Ctrl-.`.

| Kind | Offered |
| --- | --- |
| **Fix** | Remove a leftover `debugger`; use `===` when `=` appears in an `if`/`while` condition; add the missing `:` in Python; add a missing `;` in CSS; convert tab indentation to spaces; trim trailing whitespace |
| **Import** | **Import `clamp`** when you use a symbol another file exports (named, default and Python `from x import y`, with the relative path worked out); remove unused imports (single name or whole statement) |
| **Refactor** | Rename a symbol everywhere in the file; `let`→`const` when it is never reassigned; `var`→`let`; toggle single/double quotes; extract a selection into a `const` |
| **Create** | Create the file an import or `<script src>` points at but the project lacks |

A small **yellow bulb sits in the gutter on every line that has something to offer** — the same place
a problem gets its `!` marker — and tapping it opens the actions for that line. Quick fixes also appear as buttons **inside the problems tooltip**, so tapping a squiggle offers the fix
right where the error is. Renames ask for the new name in a small prompt and apply every occurrence in
one transaction.


- **Live bug detection, offline, no server.** The status strip shows `No problems` or `1 error · 2 warnings`
  for the open file; tap it for the **Problems** sheet, which groups every issue by file with its
  `line:column`, message and rule. Tap a row and the caret jumps to that spot.
- **Squiggles in the editor.** A wavy underline marks the exact range, the gutter shows a dot per
  line, and tapping the underline shows the message in a tooltip.
- **A red "!" beside every broken file.** It sits next to the file's language badge in the Files
  list, in the open-file tabs and in the file picker, so you can spot the broken file without
  opening it. Folders roll their contents up, so a collapsed folder still shows the mark; amber
  means warnings only. The Files tab in the tab bar carries the project's error count.
- **What is actually checked** — with real parsers where the bundle has one:
  - **JS / TS / JSX / TSX** — Sucrase parse errors at the exact line and column
  - **JSON** — `JSON.parse` position, mapped back to a line
  - **Python** — missing `:` after a block, tabs vs spaces (`TabError`)
  - **HTML / XML** — unclosed tags, stray closing tags, void tags and optional `</li>` handled correctly
  - **CSS** — unbalanced blocks, declarations missing a `;`
  - **every language** — unbalanced brackets, unterminated strings and comments (quote-aware, so
    Rust lifetimes and JS template literals don't false-positive)
  - **project-wide** — `import './Missing'` or `<script src="./nope.js">` that resolves to no file
- **It stays quiet on correct code.** The test suite runs 22 valid files through it (one per
  language) and requires zero findings, next to matched broken files that must be caught.

---

## Editor design notes

The screen is organized around one rule: **the code gets the middle of the phone**. Every
reference I looked at (Spck Editor, Acode, Dribbble code-editor kits) does this, and each one
loses something to get there — usually the line numbers, the caret position, or the file you are in.

| Layer | Height | What it does |
| --- | --- | --- |
| Header | 52px | Workspace name, `file · language · saved just now`, run + menu |
| File tabs | 38px | Active/recent files, language dot, unsaved dot, close, all-files button |
| Editor | flexible | Wrapped code, gutter, active-line highlight, caret + selection colours |
| Status strip | 26px | `Ln/Col`, selection size, lines, size, language, tab size, save state |
| Keyboard rail | 85px | Row 1: undo/redo/indent/find/text/keys/hide-keyboard + pinned **Run**; Row 2: scrollable symbol keys |
| Tab bar | 62px + safe area | Files · Code · Run · Build |

Details that matter on a phone:

- **Symbols where your thumb already is.** A touch keyboard hides `{}`, `[]`, `<>`, `=>`, `;` and
  backticks; the rail is a keyboard extension, not a toolbar. Long rails scroll with a fade so it
  is obvious there is more.
- **Two rows, not one.** Six action icons plus keys in a single row left room for three symbols on
  a 390px screen (see the mock's history); splitting rows gives ~5 actions and 9 symbols at once.
- **The caret is a first-class feature.** `Ln/Col` updates live, the active line gets a hairline
  accent bar, and the gutter number for that line brightens — you always know where you are.
- **Quiet gutter.** Line numbers are off-white/dim and only the active one is bold, so dense code
  reads first and chrome reads second.
- **Real language marks.** Every file name carries its actual logo — the React atom on `.tsx`,
  the Python glyph on `.py`, the CSS shield on `.css`, the Rust cog on `.rs` — sourced from
  [Simple Icons](https://simpleicons.org) so the shapes and brand colours are the official ones.
  Colour lives *in the file icon* and nowhere else: the code surface stays monochrome, and the
  marks are just 15px details that let you spot a file type at a glance. Languages without a
  mark (plain text) keep a small monogram badge, and near-black marks (Rust, JSON, Markdown) are
  mixed toward the theme ink so they stay visible on the dark theme.
  Regenerate the table with `npm run language-icons`.
- **Real syntax colours, not a bespoke palette.** Syntax colour schemes people already read every
  day, with their published token colours: **VS Code Dark+/Light+** (default), **One Dark** and
  **GitHub Dark/Light** — pick one in Settings → Appearance. Because a scheme is a token mapping
  rather than a per-language table, all 45 languages get the same, correct colours: keywords blue,
  strings orange, comments green, function names sand-yellow, types teal (VS Code Dark+ values).
- **A grammar for every language.** All 45 — the CodeMirror language packages for JS/TS/TSX,
  Python, HTML, CSS, JSON, Markdown, SQL, XML, Java, C/C++, Go, Rust and PHP, and the official
  legacy stream modes for everything else (Dart, Scala, Haskell, Erlang, Julia, OCaml, F#, Perl,
  R, Groovy, Clojure, Elm, D, Pascal, Fortran, COBOL, Octave, Shell, YAML, TOML, Lua, Ruby,
  Swift, Kotlin, Dockerfile, Diff) — each lazily loaded, so a phone only downloads the grammar it
  opens. The syntax suite parses a real sample in **every** language under all three schemes and
  fails if any of them stops colouring tokens.
- **Keyboard-aware.** When the OS keyboard opens, `visualViewport` height is measured and the rail
  docks to it (sticky) rather than being pushed off-screen. The ⌄ key dismisses the keyboard.
- **Both themes are real.** Dark and light are separate palettes for chrome *and* syntax, including
  selection, search matches, bracket matching and the autocomplete popup.

Regenerate the mock with `python3 scripts/render-mock.py docs/cody-editor.png` (reads the live
tokens from `src/styles.css` and `src/editor/theme.ts`). It is a design renderer, not a browser
screenshot — this sandbox has no Chromium.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173 (also bound to 0.0.0.0)
```

Production:

```bash
npm run build        # typecheck + vite build → dist/
npm run preview
```

Quality checks:

```bash
npm run typecheck    # strict TypeScript
npm test             # 13 suites: bundler, every screen, every language, diagnostics,
                     # code actions, completions, find-in-files, Build AI (selection,
                     # failover, tools, crew), styles, jsdom app smoke
```

The `languages` suite is the one that keeps the table honest: unique ids and extensions, path
routing for every new syntax, a Piston runtime id for every cloud language, a grammar that loads for
every id, and a runnable hello-world snippet for each language added after the first 28.

Open Cody on a phone on the same network, or add it to your home screen for the standalone
app experience.

---

## Deployment

Cody is a static Vite build, so it deploys anywhere that serves files.

**Vercel** — this repo is connected to the Vercel project `cody`:

| | |
| --- | --- |
| Production | https://cody-flux-cf70.vercel.app |
| Branch alias | https://cody-git-arena-e151acae-cody-flux-cf70.vercel.app |

`vercel.json` pins the framework (Vite), build command (`npm run build`), output directory
(`dist`) and long-lived caching for `/assets/*` (the service worker is kept revalidating so PWA
updates land immediately).

Any other host works the same way: `npm run build` and serve `dist/`, giving the app a single-page
fallback to `index.html`. To install it on a phone, open the deployment URL and use
**Add to Home Screen** — the manifest and icons are already wired up.

## Architecture

```
src/
  App.tsx                  app shell: routing, state, persistence, run orchestration
  components/
    ProjectSwitcher.tsx    workspace list, new workspace, rename, import, theme/settings
    ProjectView.tsx        header, tab bar, project menu & sheets
    FilesPane.tsx          file tree, search, file actions
    SearchSheet.tsx        find in files: results, case/regex, project-wide replace
    CodePane.tsx           editor host + mobile toolbars/sheets
    RunPanel.tsx           entry picker, preview iframe, console, stdin
    CodyPanel.tsx          offline snippet library & project stats
    ai/BuildAiPane.tsx     Build AI: chat, crew, tool activity, approval sheet
    ai/AiSettingsSheet.tsx BYOK keys, model selection, failover, per-role pinning
    ai/useAiSession.ts     a run: transcript, activity, stop, approval, revert
    SettingsSheet.tsx      appearance, preview, runner, data
    Sheet.tsx              bottom-sheet primitive (+ PromptSheet)
  editor/
    CodeEditor.tsx         CodeMirror 6 wrapper with imperative handle
    theme.ts               dark/light editor themes + syntax palettes
  lib/
    bundle.ts              in-browser bundler (specifier rewrite, HTML inlining, import map)
    python.ts/.worker.ts   Pyodide worker bridge
    cloud.ts               Piston client + runner health check
    storage.ts             IndexedDB (localStorage fallback) persistence
    languages.ts           45-language registry + lazy CodeMirror grammars
    starter.ts             what a new workspace starts as (three plain files)
    snippets.ts            snippet library
    search.ts              find in files: matching, previews, replacement
    importExport.ts        ZIP / JSON import-export, share
    zip.ts                 minimal ZIP writer (store + CRC32)
    utils.ts               small shared helpers
    ai/providers.ts        the provider table: base URLs, auth headers, model hints
    ai/keys.ts             BYOK key store (localStorage, deliberately outside the project)
    ai/config.ts           AI settings shape, role definitions, defaults, repair
    ai/client.ts           candidate selection, failover, model discovery, health check
    ai/tools.ts            the 21-tool surface, argument hygiene, tool-call parsing
    ai/crew.ts             planner → coder A → coder B → tester, and plain chat
```

### How the in-browser bundler works

1. Pick an entry file (`project.entry`, an `index.html`/`src/main.tsx` heuristic, or the file you
   tapped).
2. For an HTML entry: inline local `<link rel=stylesheet>` and classic `<script src>` tags, map
   local `<script type=module src>` tags to blob URLs, inline referenced images/SVG as data URLs,
   and inject the console bridge.
3. For a JS/TS entry: transpile with Sucrase (`typescript`, `jsx`, automatic JSX runtime),
   rewrite relative imports to `https://cody.local/<path>` (resolved against the file map with
   extension/index guesses), send bare imports to esm.sh, and register every module as a blob URL
   in a generated `<script type="importmap">`.
4. The shell HTML is rendered into an `iframe srcdoc`; anything the project logs is forwarded to
   Cody's console via `postMessage`.

This means React, Three.js and any esm.sh-compatible package work with zero install — and any
relative import you add to the project resolves without configuration.

---

## Privacy & data

- Projects, settings and the last-open project live in IndexedDB on your device (with a
  localStorage fallback), including "backup all" → one JSON file.
- Browser previews run locally. React projects fetch their packages from `esm.sh`,
  Python fetches Pyodide from `jsDelivr`, and cloud-sandbox languages send the single entry file to
  the configured Piston endpoint (public by default; point it at your own in Settings).

## Known limits

- Previews use blob modules, so a project file that is *only* imported dynamically by a URL string
  built at runtime won't resolve.
- Cloud runs send one file (the entry). Multi-file compiled builds belong on a desktop or in a
  container.
- The public Piston endpoint rate-limits; run your own instance for heavy use.
- Pyodide needs ~10 MB on first Python run (cached afterwards).
- Build AI quality is your model's quality. Free and small models call tools unreliably; the
  fetch loop, failover and the tester's real checks blunt that, but they do not remove it.
- Providers that do not implement `/models` fall back to the curated ids in `src/lib/ai/providers.ts`.
- xKiro closes a *blocking* request at 95 s, so Cody gives up at 90 s there and falls over to the next
  model. Long reasoning prompts want a provider that streams, or a smaller output budget.
- Free tiers are rate-limited, and a free tier that changes its models is normal. Press *List* on a
  provider card to load what it really serves; ids ending in `:free` count as free automatically, and
  xKiro's 47 free models only appear once you list them.
- A free-only run has fewer candidates to fall over to. The switch in AI settings widens the pool;
  a model you type in yourself always wins, free or not.
- Cross-origin calls go straight from the browser, so a provider must allow browser keys (all the
  ones listed do). A local Ollama needs `OLLAMA_ORIGINS` set.

## Roadmap ideas

- Crew memory across runs, so a follow-up does not repeat the whole plan

- Split editor view for tablets (files + code side by side)
- Diff view for imported files, git export as a commit-ready patch
- Optional GitHub sign-in to push a project as a repository
- Multi-file cloud runs via a container runner
