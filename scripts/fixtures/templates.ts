/* eslint-disable */
import type { Project, ProjectFile } from '../../src/types'
import type { Runtime } from '../../src/lib/languages'
import { uid } from '../../src/lib/utils'

export type Template = {
  id: string
  name: string
  tagline: string
  emoji: string
  accent: string
  tags: string[]
  runtime: Runtime
  entry: string
  files: ProjectFile[]
}

const html = (body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>My Cody app</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
${body}
    <script src="./app.js"></script>
  </body>
</html>
`

export const TEMPLATES: Template[] = [
  {
    id: 'web-starter',
    name: 'Web app',
    tagline: 'HTML, CSS and JavaScript that runs instantly in the live preview.',
    emoji: '🌐',
    accent: '#5ce1b9',
    tags: ['HTML', 'CSS', 'JS'],
    runtime: 'web',
    entry: 'index.html',
    files: [
      {
        path: 'index.html',
        content: html(`    <main class="app">
      <header class="hero">
        <span class="badge">Built with Cody</span>
        <h1>Ship it<br /><em>from your phone.</em></h1>
        <p>A tiny counter app. Tap, edit, and watch the preview update.</p>
      </header>

      <section class="card">
        <div class="count" id="count">0</div>
        <div class="row">
          <button class="btn ghost" id="decrement" aria-label="Decrease">−</button>
          <button class="btn primary" id="increment">Tap me</button>
        </div>
        <p class="hint" id="hint">Press the button to begin.</p>
      </section>
    </main>`),
      },
      {
        path: 'styles.css',
        content: `:root {
  --bg: #0b0d10;
  --card: #151a22;
  --line: #232b38;
  --text: #e8ecf3;
  --muted: #8b93a1;
  --accent: #5ce1b9;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100dvh;
  background: radial-gradient(120% 80% at 50% 0%, #16303a 0%, var(--bg) 55%);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: grid;
  place-items: center;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
}

.app { width: min(420px, 100%); display: grid; gap: 22px; }

.badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid rgba(92, 225, 185, 0.35);
  background: rgba(92, 225, 185, 0.08);
  padding: 5px 10px;
  border-radius: 999px;
}

h1 { font-size: clamp(30px, 9vw, 42px); line-height: 1.05; margin: 14px 0 10px; letter-spacing: -0.03em; }
h1 em { color: var(--accent); font-style: normal; }
.hero p { color: var(--muted); margin: 0; font-size: 15px; }

.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 22px;
  display: grid;
  gap: 18px;
}

.count { font-size: 64px; font-weight: 700; text-align: center; letter-spacing: -0.04em; }
.row { display: flex; gap: 12px; }
.btn { flex: 1; border-radius: 14px; border: 1px solid var(--line); padding: 15px 18px; font-size: 15px; font-weight: 600; }
.btn:active { transform: scale(0.98); }
.primary { background: var(--accent); color: #06251c; border-color: transparent; }
.ghost { background: transparent; color: var(--text); }
.hint { text-align: center; color: var(--muted); font-size: 13px; margin: 0; min-height: 18px; }
`,
      },
      {
        path: 'app.js',
        content: `const countEl = document.getElementById('count')
const hintEl = document.getElementById('hint')
let count = 0

function render() {
  countEl.textContent = String(count)
  hintEl.textContent =
    count === 0
      ? 'Press the button to begin.'
      : count === 1
        ? 'That was one tap. Now make it yours.'
        : count + ' taps and counting.'
  countEl.style.transform = 'scale(1.06)'
  setTimeout(() => (countEl.style.transform = 'scale(1)'), 90)
}

document.getElementById('increment').addEventListener('click', () => {
  count += 1
  render()
})

document.getElementById('decrement').addEventListener('click', () => {
  count -= 1
  render()
})

render()
console.log('Cody web starter ready ✨')
`,
      },
      {
        path: 'README.md',
        content: `# My Cody app

A single-page app you can edit entirely from your phone.

- \`index.html\` — structure
- \`styles.css\` — looks
- \`app.js\` — behavior

Tap **Run** to preview, then export a ZIP from the project menu when you are happy.
`,
      },
    ],
  },
  {
    id: 'react-ts',
    name: 'React + TypeScript',
    tagline: 'Typed components, hooks and JSX — bundled right in your browser.',
    emoji: '⚛️',
    accent: '#61dafb',
    tags: ['React', 'TypeScript'],
    runtime: 'web',
    entry: 'src/main.tsx',
    files: [
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>React on Cody</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
      },
      {
        path: 'src/main.tsx',
        content: `import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(<App />)
`,
      },
      {
        path: 'src/App.tsx',
        content: `import { useMemo, useState } from 'react'
import Task from './Task'

type Item = { id: number; label: string; done: boolean }

export default function App() {
  const [items, setItems] = useState<Item[]>([
    { id: 1, label: 'Design on the bus', done: true },
    { id: 2, label: 'Write the app from your phone', done: false },
    { id: 3, label: 'Ship it', done: false },
  ])
  const [draft, setDraft] = useState('')

  const remaining = useMemo(() => items.filter((item) => !item.done).length, [items])

  function add() {
    const label = draft.trim()
    if (!label) return
    setItems((prev) => [...prev, { id: Date.now(), label, done: false }])
    setDraft('')
  }

  function toggle(id: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  return (
    <main className="app">
      <header>
        <p className="kicker">React + TypeScript</p>
        <h1>Cody tasks</h1>
        <p className="sub">{remaining} left to do</p>
      </header>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task…"
          aria-label="New task"
        />
        <button type="submit">Add</button>
      </form>

      <ul className="list">
        {items.map((item) => (
          <Task key={item.id} label={item.label} done={item.done} onToggle={() => toggle(item.id)} />
        ))}
      </ul>

      {items.length === 0 && <p className="empty">Nothing here yet. Add your first task.</p>}
    </main>
  )
}
`,
      },
      {
        path: 'src/Task.tsx',
        content: `type Props = {
  label: string
  done: boolean
  onToggle: () => void
}

export default function Task({ label, done, onToggle }: Props) {
  return (
    <li className={done ? 'task done' : 'task'}>
      <button type="button" onClick={onToggle} aria-pressed={done}>
        <span className="box">{done ? '✓' : ''}</span>
        <span className="label">{label}</span>
      </button>
    </li>
  )
}
`,
      },
      {
        path: 'src/styles.css',
        content: `:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  background: #0b0d10;
  color: #e8ecf3;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 26px 18px calc(30px + env(safe-area-inset-bottom));
}
.app { width: min(440px, 100%); margin: 0 auto; display: grid; gap: 18px; }
.kicker { text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px; color: #61dafb; margin: 0 0 6px; }
h1 { margin: 0; font-size: 32px; letter-spacing: -0.03em; }
.sub { color: #8b93a1; margin: 6px 0 0; font-size: 14px; }
.composer { display: flex; gap: 8px; }
.composer input {
  flex: 1; min-width: 0; background: #151a22; border: 1px solid #232b38;
  color: #e8ecf3; border-radius: 12px; padding: 13px 14px; font-size: 16px;
}
.composer button {
  background: #61dafb; color: #062028; border: 0; border-radius: 12px;
  padding: 0 18px; font-weight: 700; font-size: 15px;
}
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.task button {
  width: 100%; display: flex; align-items: center; gap: 12px; text-align: left;
  background: #151a22; border: 1px solid #232b38; color: inherit;
  border-radius: 14px; padding: 14px; font-size: 15px;
}
.task .box {
  width: 22px; height: 22px; border-radius: 7px; border: 1px solid #3a465c;
  display: grid; place-items: center; font-size: 13px; color: #06251c; flex: none;
}
.task.done .box { background: #5ce1b9; border-color: transparent; }
.task.done .label { color: #6f7a8c; text-decoration: line-through; }
.empty { color: #8b93a1; text-align: center; font-size: 14px; }
`,
      },
      {
        path: 'README.md',
        content: `# React + TypeScript on Cody

Cody transpiles TSX with Sucrase and resolves \`react\` / \`react-dom\` from esm.sh —
no install step, no build server.

Add more components in \`src/\` and import them; the live preview reloads.
`,
      },
    ],
  },
  {
    id: 'python',
    name: 'Python script',
    tagline: 'Real CPython in your browser via Pyodide, with package support.',
    emoji: '🐍',
    accent: '#3776ab',
    tags: ['Python', 'Console'],
    runtime: 'python',
    entry: 'main.py',
    files: [
      {
        path: 'main.py',
        content: `"""Cody Python starter — runs on Pyodide (CPython compiled to WASM)."""

from collections import Counter
from dataclasses import dataclass


@dataclass
class Habit:
    name: str
    streak: int

    def tick(self) -> "Habit":
        self.streak += 1
        return self


def main() -> None:
    habits = [Habit("read 10 pages", 3), Habit("walk", 8), Habit("no sugar", 1)]

    print("Habit tracker")
    print("-" * 28)
    for habit in habits:
        habit.tick()
        bar = "#" * habit.streak
        print(f"{habit.name:<14} {bar:<10} {habit.streak}")

    letters = Counter("cody builds projects from your phone")
    print()
    print("Top letters:", letters.most_common(3))

    squares = {n: n * n for n in range(1, 8)}
    print("Squares:", squares)


if __name__ == "__main__":
    main()
`,
      },
      {
        path: 'utils.py',
        content: `def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def slugify(text: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "-" for ch in text.lower())
    return "-".join(part for part in cleaned.split("-") if part)
`,
      },
      {
        path: 'README.md',
        content: `# Python on Cody

Tap **Run** — Cody loads Pyodide (CPython 3.12 compiled to WebAssembly) in a
background worker and streams stdout/stderr as it happens.

\`\`\`python
import numpy  # pure-wheel packages are loaded automatically
\`\`\`

The first run downloads roughly 10 MB of runtime, then it is cached by the browser.
`,
      },
    ],
  },
  {
    id: 'node-api',
    name: 'Node API project',
    tagline: 'A multi-file backend: Express server, routes, env, Dockerfile.',
    emoji: '🛠️',
    accent: '#68a063',
    tags: ['Node', 'Express', 'Docker'],
    runtime: 'cloud',
    entry: 'server.js',
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "cody-node-api",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
`,
      },
      {
        path: 'server.js',
        content: `import express from 'express'
import { listTasks, createTask } from './src/routes/tasks.js'

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }))
app.get('/api/tasks', listTasks)
app.post('/api/tasks', createTask)

const port = process.env.PORT || 3000
app.listen(port, () => console.log('cody api listening on ' + port))
`,
      },
      {
        path: 'src/routes/tasks.js',
        content: `const tasks = []

export function listTasks(_req, res) {
  res.json({ tasks })
}

export function createTask(req, res) {
  const label = String(req.body?.label ?? '').trim()
  if (!label) return res.status(400).json({ error: 'label is required' })
  const task = { id: tasks.length + 1, label, done: false, createdAt: new Date().toISOString() }
  tasks.push(task)
  res.status(201).json(task)
}
`,
      },
      {
        path: 'Dockerfile',
        content: `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
`,
      },
      {
        path: '.env.example',
        content: `PORT=3000
DATABASE_URL=postgres://localhost:5432/cody
`,
      },
      {
        path: 'README.md',
        content: `# Node API project

Structure:

\`\`\`
server.js            HTTP entrypoint
src/routes/tasks.js  route handlers
Dockerfile           container build
.env.example         configuration
\`\`\`

Run locally with \`npm start\`. In Cody you can use the cloud runner for
single-file experiments, or export the ZIP to keep building on a desktop.
`,
      },
    ],
  },
  {
    id: 'c-console',
    name: 'C program',
    tagline: 'Classic C with structs and pointers, ready for the cloud runner.',
    emoji: '🔧',
    accent: '#a8b9cc',
    tags: ['C', 'Console'],
    runtime: 'cloud',
    entry: 'main.c',
    files: [
      {
        path: 'main.c',
        content: `#include <stdio.h>
#include <string.h>

typedef struct {
    char name[32];
    int streak;
} Habit;

void print_habit(Habit h) {
    printf("%-16s %d", h.name, h.streak);
    for (int i = 0; i < h.streak; i++) printf(" *");
    printf("\\n");
}

int main(void) {
    Habit habits[3] = {
        {"read", 3},
        {"walk", 5},
        {"no sugar", 1},
    };

    printf("Habit tracker (%zu habits)\\n", sizeof(habits) / sizeof(habits[0]));
    for (int i = 0; i < 3; i++) {
        habits[i].streak += 1;
        print_habit(habits[i]);
    }
    return 0;
}
`,
      },
      {
        path: 'README.md',
        content: `# C on Cody

Tap **Run** to compile and execute in a cloud sandbox (gcc). Output streams into
the console panel.

Add \`-lm\`-style flags? Keep single-file programs for the sandbox; multiplayer
builds belong on your desktop.
`,
      },
    ],
  },
  {
    id: 'go-service',
    name: 'Go service',
    tagline: 'A tiny HTTP handler and JSON output in idiomatic Go.',
    emoji: '🐹',
    accent: '#00add8',
    tags: ['Go', 'Console'],
    runtime: 'cloud',
    entry: 'main.go',
    files: [
      {
        path: 'main.go',
        content: `package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Task struct {
	ID    int    \`json:"id"\`
	Label string \`json:"label"\`
	Done  bool   \`json:"done"\`
}

func main() {
	tasks := []Task{{1, "design", true}, {2, "build", false}, {3, "ship", false}}

	payload, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		panic(err)
	}

	fmt.Println("tasks:")
	fmt.Println(string(payload))

	for _, task := range tasks {
		box := " "
		if task.Done {
			box = "x"
		}
		fmt.Printf("[%s] %s\\n", box, strings.ToUpper(task.Label))
	}
}
`,
      },
    ],
  },
  {
    id: 'rust',
    name: 'Rust',
    tagline: 'Ownership-friendly starter with iterators and structs.',
    emoji: '🦀',
    accent: '#dea584',
    tags: ['Rust', 'Console'],
    runtime: 'cloud',
    entry: 'main.rs',
    files: [
      {
        path: 'main.rs',
        content: `#[derive(Debug)]
struct Habit {
    name: String,
    streak: u32,
}

impl Habit {
    fn tick(&mut self) {
        self.streak += 1;
    }

    fn bar(&self) -> String {
        "*".repeat(self.streak as usize)
    }
}

fn main() {
    let mut habits = vec![
        Habit { name: "read".into(), streak: 3 },
        Habit { name: "walk".into(), streak: 7 },
    ];

    for habit in habits.iter_mut() {
        habit.tick();
    }

    let total: u32 = habits.iter().map(|h| h.streak).sum();
    for habit in &habits {
        println!("{:<10} {:<10} {}", habit.name, habit.bar(), habit.streak);
    }
    println!("total {} days across {} habits", total, habits.len());
}
`,
      },
    ],
  },
  {
    id: 'java',
    name: 'Java',
    tagline: 'Single-file Java 17 program with records and streams.',
    emoji: '☕',
    accent: '#b07219',
    tags: ['Java', 'Console'],
    runtime: 'cloud',
    entry: 'Main.java',
    files: [
      {
        path: 'Main.java',
        content: `import java.util.List;
import java.util.stream.Collectors;

public class Main {
    record Habit(String name, int streak) {
        Habit tick() {
            return new Habit(name, streak + 1);
        }
    }

    public static void main(String[] args) {
        List<Habit> habits = List.of(
            new Habit("read", 3),
            new Habit("walk", 7),
            new Habit("no sugar", 1)
        );

        List<Habit> ticked = habits.stream().map(Habit::tick).collect(Collectors.toList());
        ticked.forEach(habit -> System.out.printf("%-10s %d%n", habit.name(), habit.streak()));

        int total = ticked.stream().mapToInt(Habit::streak).sum();
        System.out.println("total: " + total);
    }
}
`,
      },
    ],
  },
  {
    id: 'three-scene',
    name: 'Three.js scene',
    tagline: 'WebGL in a single file, pulled from a CDN. Great on a phone.',
    emoji: '🧊',
    accent: '#ffd166',
    tags: ['Three.js', 'WebGL'],
    runtime: 'web',
    entry: 'index.html',
    files: [
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Three.js · Cody</title>
    <style>
      html, body { margin: 0; height: 100%; background: #05070c; overflow: hidden; }
      canvas { display: block; }
      .hint {
        position: fixed; inset: auto 0 18px 0; text-align: center;
        font: 12px/1.4 -apple-system, sans-serif; color: #8b93a1; letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <p class="hint">drag to orbit · pinch to zoom</p>
    <script type="module" src="./scene.js"></script>
  </body>
</html>
`,
      },
      {
        path: 'scene.js',
        content: `import * as THREE from 'three'

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x05070c, 6, 16)

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 1.4, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x05070c)
document.body.appendChild(renderer.domElement)

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1.15, 0.36, 220, 32),
  new THREE.MeshStandardMaterial({ color: 0x5ce1b9, roughness: 0.22, metalness: 0.75 }),
)
scene.add(knot)

scene.add(new THREE.HemisphereLight(0x7cc7ff, 0x0b0d10, 0.7))
const key = new THREE.PointLight(0x8b7cff, 60, 20)
key.position.set(3, 4, 4)
scene.add(key)
const rim = new THREE.PointLight(0xffd166, 35, 20)
rim.position.set(-4, -2, -3)
scene.add(rim)

let pointerDown = false
let lastX = 0
let lastY = 0
let velocity = 0.004

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = true
  lastX = event.clientX
  lastY = event.clientY
})

addEventListener('pointerup', () => (pointerDown = false))

addEventListener('pointermove', (event) => {
  if (!pointerDown) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  velocity = dx * 0.0006
  knot.rotation.y += velocity
  knot.rotation.x += dy * 0.004
})

function resize() {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
}
addEventListener('resize', resize)

renderer.setAnimationLoop(() => {
  if (!pointerDown) {
    knot.rotation.y += velocity
    velocity *= 0.995
    knot.rotation.x += 0.0015
  }
  renderer.render(scene, camera)
})

console.log('three.js ready')
`,
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank file',
    tagline: 'Start from nothing. Pick a language by naming your file.',
    emoji: '📄',
    accent: '#8b93a1',
    tags: ['Any language'],
    runtime: 'web',
    entry: 'main.js',
    files: [{ path: 'main.js', content: '// Start building\nconsole.log("hello from cody")\n' }],
  },
]

export function projectFromTemplate(template: Template, name?: string): Project {
  const now = Date.now()
  return {
    id: uid('p_'),
    name: name?.trim() || template.name,
    description: template.tagline,
    templateId: template.id,
    entry: template.entry,
    files: template.files.map((file) => ({ ...file })),
    createdAt: now,
    updatedAt: now,
  }
}

export function getTemplate(id: string | undefined): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/**
 * The workspace Cody boots into the very first time — an empty-but-runnable
 * project so the editor is on screen immediately, with no landing page in the way.
 */
export function scratchProject(name = 'Untitled'): Project {
  const now = Date.now()
  return {
    id: uid('p_'),
    name,
    description: 'Scratch workspace',
    templateId: 'web-starter',
    entry: 'index.html',
    files: [
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Untitled</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <h1>Hello from Cody</h1>
      <p>Edit this file, then tap Run.</p>
      <button id="ping" type="button">Ping</button>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`,
      },
      {
        path: 'styles.css',
        content: `body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0b0d10; color: #e8ecf3; }
main { padding: 28px 20px; display: grid; gap: 12px; }
h1 { font-size: 26px; margin: 0; letter-spacing: -0.02em; }
p { margin: 0; color: #8b93a1; font-size: 15px; }
button { justify-self: start; padding: 12px 18px; border-radius: 12px; border: 0; background: #5ce1b9; color: #06251c; font-weight: 600; font-size: 15px; }
`,
      },
      {
        path: 'app.js',
        content: `let pings = 0

document.getElementById('ping').addEventListener('click', () => {
  pings += 1
  console.log('ping', pings)
})
`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}
