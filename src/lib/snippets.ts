export type Snippet = {
  id: string
  title: string
  description: string
  languages: string[]
  category: 'UI' | 'Data' | 'Layout' | 'Async' | 'Python' | 'Systems' | 'Docs'
  code: string
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'button',
    title: 'Tap-friendly button',
    description: '44px minimum hit area, active feedback.',
    languages: ['html'],
    category: 'UI',
    code: `<button class="tap-btn" type="button" onclick="handleTap()">Tap me</button>

<style>
  .tap-btn {
    min-height: 48px;
    padding: 0 20px;
    border-radius: 14px;
    border: 0;
    background: #5ce1b9;
    color: #06251c;
    font-size: 16px;
    font-weight: 600;
    width: 100%;
  }
  .tap-btn:active { transform: scale(.98); }
</style>`,
  },
  {
    id: 'form',
    title: 'Form with validation',
    description: 'Accessible inputs plus inline error handling.',
    languages: ['html'],
    category: 'UI',
    code: `<form id="signup" novalidate>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required />
  <p class="error" id="email-error" role="alert"></p>
  <button type="submit">Continue</button>
</form>

<script>
  const form = document.getElementById('signup')
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const email = form.email.value.trim()
    const error = document.getElementById('email-error')
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
      error.textContent = 'Enter a valid email address.'
      form.email.setAttribute('aria-invalid', 'true')
      return
    }
    error.textContent = ''
    form.email.removeAttribute('aria-invalid')
    console.log('submitted', { email })
  })
</script>`,
  },
  {
    id: 'fetch-render',
    title: 'Fetch + render a list',
    description: 'Async data with loading and error states.',
    languages: ['javascript', 'html'],
    category: 'Async',
    code: `const list = document.getElementById('list')

async function load() {
  list.innerHTML = '<li>Loading…</li>'
  try {
    const response = await fetch('https://api.github.com/repos/facebook/react/issues?per_page=5')
    if (!response.ok) throw new Error('Request failed: ' + response.status)
    const issues = await response.json()
    list.innerHTML = issues
      .map((issue) => '<li><a href="' + issue.html_url + '">' + issue.title + '</a></li>')
      .join('')
  } catch (error) {
    list.innerHTML = '<li class="error">Could not load data</li>'
    console.error(error)
  }
}

load()`,
  },
  {
    id: 'storage',
    title: 'Persist state',
    description: 'localStorage helpers that survive reloads.',
    languages: ['javascript'],
    category: 'Data',
    code: `const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem('cody:' + key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  write(key, value) {
    try {
      localStorage.setItem('cody:' + key, JSON.stringify(value))
    } catch (error) {
      console.warn('storage unavailable', error)
    }
  },
}

const settings = store.read('settings', { theme: 'dark' })
store.write('settings', { ...settings, seen: true })`,
  },
  {
    id: 'responsive-grid',
    title: 'Responsive card grid',
    description: 'Mobile-first grid using container queries.',
    languages: ['css', 'html'],
    category: 'Layout',
    code: `.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

@media (min-width: 720px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
}

.card {
  border: 1px solid #232b38;
  border-radius: 16px;
  padding: 16px;
  background: #151a22;
}`,
  },
  {
    id: 'safe-area',
    title: 'iPhone-safe layout',
    description: 'Bottom nav that respects the home indicator.',
    languages: ['css'],
    category: 'Layout',
    code: `:root {
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

.page {
  min-height: 100dvh;
  padding-bottom: calc(72px + var(--safe-bottom));
}

.bottom-nav {
  position: fixed;
  inset: auto 0 0 0;
  padding: 8px 12px calc(8px + var(--safe-bottom));
  background: rgba(11, 13, 16, .92);
  backdrop-filter: blur(16px);
}`,
  },
  {
    id: 'react-hook',
    title: 'React: useLocalStorage',
    description: 'Typed hook that syncs state with storage.',
    languages: ['tsx', 'jsx', 'typescript'],
    category: 'Data',
    code: `import { useCallback, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },
    [key],
  )

  return [value, update] as const
}`,
  },
  {
    id: 'react-component',
    title: 'React: component scaffold',
    description: 'Props type, layout and a default export.',
    languages: ['tsx', 'jsx'],
    category: 'UI',
    code: `type Props = {
  title: string
  onSelect?: (id: string) => void
}

export default function Card({ title, onSelect }: Props) {
  return (
    <article className="card" onClick={() => onSelect?.(title)}>
      <h2>{title}</h2>
      <p>Replace me with real content.</p>
    </article>
  )
}`,
  },
  {
    id: 'canvas',
    title: 'Canvas animation loop',
    description: 'requestAnimationFrame with DPR handling.',
    languages: ['javascript'],
    category: 'UI',
    code: `const canvas = document.querySelector('canvas')
const ctx = canvas.getContext('2d')
let raf = 0
let t = 0

function resize() {
  const dpr = Math.min(devicePixelRatio, 2)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize)
resize()

function frame() {
  t += 0.016
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  ctx.fillStyle = '#5ce1b9'
  ctx.beginPath()
  ctx.arc(innerWidth / 2 + Math.sin(t) * 60, innerHeight / 2, 24, 0, Math.PI * 2)
  ctx.fill()
  raf = requestAnimationFrame(frame)
}
frame()`,
  },
  {
    id: 'debounce',
    title: 'Debounce + throttle',
    description: 'Two tiny utilities you will reach for constantly.',
    languages: ['javascript', 'typescript'],
    category: 'Async',
    code: `export function debounce(fn, wait = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function throttle(fn, interval = 200) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last < interval) return
    last = now
    fn(...args)
  }
}`,
  },
  {
    id: 'python-main',
    title: 'Python: script skeleton',
    description: 'argparse, logging and a main guard.',
    languages: ['python'],
    category: 'Python',
    code: `import argparse
import logging


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cody tool")
    parser.add_argument("--limit", type=int, default=10)
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = build_parser().parse_args()
    logging.info("limit=%s", args.limit)


if __name__ == "__main__":
    main()`,
  },
  {
    id: 'python-requests',
    title: 'Python: HTTP + JSON',
    description: 'Fetch JSON with urllib (stdlib, no install).',
    languages: ['python'],
    category: 'Python',
    code: `import json
import urllib.request


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


if __name__ == "__main__":
    data = fetch_json("https://api.github.com/repos/python/cpython")
    print(data["full_name"], "⭐", data["stargazers_count"])`,
  },
  {
    id: 'python-class',
    title: 'Python: dataclass model',
    description: 'Validation, defaults and a repr for free.',
    languages: ['python'],
    category: 'Python',
    code: `from dataclasses import dataclass, field


@dataclass
class Task:
    title: str
    done: bool = False
    tags: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValueError("title is required")
        self.title = self.title.strip()

    def complete(self) -> "Task":
        self.done = True
        return self`,
  },
  {
    id: 'go-handler',
    title: 'Go: HTTP handler',
    description: 'net/http with JSON responses.',
    languages: ['go'],
    category: 'Systems',
    code: `package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type Item struct {
	ID   int    \`json:"id"\`
	Name string \`json:"name"\`
}

func handleItems(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]Item{{1, "first"}, {2, "second"}})
}

func main() {
	http.HandleFunc("/api/items", handleItems)
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}`,
  },
  {
    id: 'sql-schema',
    title: 'SQL: schema + seed',
    description: 'Tables, foreign keys and sample rows.',
    languages: ['sql'],
    category: 'Data',
    code: `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

INSERT INTO users (email) VALUES ('me@example.com');
INSERT INTO tasks (user_id, label) VALUES (1, 'ship from my phone');

SELECT users.email, tasks.label
FROM tasks JOIN users ON users.id = tasks.user_id;`,
  },
  {
    id: 'java-record',
    title: 'Java: record + stream',
    description: 'Modern Java with immutable data.',
    languages: ['java'],
    category: 'Systems',
    code: `import java.util.List;

public class Demo {
    record Item(String name, int qty) {}

    public static void main(String[] args) {
        List<Item> items = List.of(new Item("coffee", 2), new Item("tea", 5));
        int total = items.stream().mapToInt(Item::qty).sum();
        items.forEach(i -> System.out.printf("%s x%d%n", i.name(), i.qty()));
        System.out.println("total: " + total);
    }
}`,
  },
  {
    id: 'c-struct',
    title: 'C: struct + helper',
    description: 'Typedef struct with formatted output.',
    languages: ['c', 'cpp'],
    category: 'Systems',
    code: `#include <stdio.h>

typedef struct {
    const char *name;
    int value;
} Entry;

static void print_entry(const Entry *entry) {
    printf("%-12s %4d\\n", entry->name, entry->value);
}

int main(void) {
    Entry entries[] = {{"alpha", 1}, {"beta", 2}, {"gamma", 3}};
    for (size_t i = 0; i < sizeof(entries) / sizeof(entries[0]); i++) {
        print_entry(&entries[i]);
    }
    return 0;
}`,
  },
  {
    id: 'rust-struct',
    title: 'Rust: struct + iterator',
    description: 'Owned data with iterator chains.',
    languages: ['rust'],
    category: 'Systems',
    code: `#[derive(Debug, Clone)]
struct Entry {
    name: String,
    value: i32,
}

fn main() {
    let entries: Vec<Entry> = vec![
        Entry { name: "alpha".into(), value: 1 },
        Entry { name: "beta".into(), value: 2 },
    ];

    let total: i32 = entries.iter().map(|e| e.value).sum();
    for entry in &entries {
        println!("{:<10} {}", entry.name, entry.value);
    }
    println!("total: {}", total);
}`,
  },
  {
    id: 'readme',
    title: 'README scaffold',
    description: 'A short, honest project readme.',
    languages: ['markdown', 'text'],
    category: 'Docs',
    code: `# Project name

One sentence about what this does.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## Structure

| Path | Purpose |
| --- | --- |
| \`src/\` | application code |
| \`public/\` | static assets |

## Notes

- Built on a phone with Cody.
`,
  },
  {
    id: 'html-meta',
    title: 'HTML mobile head',
    description: 'Viewport, theme color and PWA hooks.',
    languages: ['html'],
    category: 'Layout',
    code: `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0d10" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <title>My app</title>
</head>`,
  },
]

export function snippetsFor(language: string): Snippet[] {
  const exact = SNIPPETS.filter((snippet) => snippet.languages.includes(language))
  const rest = SNIPPETS.filter((snippet) => !snippet.languages.includes(language))
  return [...exact, ...rest]
}
