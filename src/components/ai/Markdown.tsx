/**
 * A very small markdown renderer for the AI transcript.
 *
 * Models answer in markdown whether you ask them to or not — `**bold**`, `-`
 * bullets, fenced code — and showing that source to a person is showing them
 * the wrong thing. This renders the five constructs an answer actually uses
 * (bold/italic, inline code, bullets, numbered lists, fenced code, links) and
 * leaves everything else as the text it was.
 *
 * No dependency, no `dangerouslySetInnerHTML`: every node is built by React, so
 * a model that writes `<img onerror=…>` simply gets those characters printed.
 * Links are only made clickable when they are http(s).
 */
import { useMemo, type ReactNode } from 'react'

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>()]+)/g

/** Inline markdown inside a line of text. */
export function inlineNodes(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  // One scanner per call: bold/italic recurse into this function, and a shared
  // global regex would hand the outer loop a rewound `lastIndex`.
  const scanner = new RegExp(INLINE.source, 'g')
  let match = scanner.exec(text)
  while (match) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${index++}`

    // `snake_case_name` and `2*3*4` are words and arithmetic, not emphasis.
    const singleMarker = (token.startsWith('*') && !token.startsWith('**')) || (token.startsWith('_') && !token.startsWith('__'))
    const before = match.index > 0 ? text[match.index - 1] : ''
    const after = text[match.index + token.length] ?? ''
    if (singleMarker && (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after))) {
      nodes.push(token)
      last = match.index + token.length
      match = scanner.exec(text)
      continue
    }

    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{inlineNodes(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('[')) {
      const cut = token.indexOf('](')
      nodes.push(
        <a key={key} href={token.slice(cut + 2, -1)} target="_blank" rel="noreferrer">
          {token.slice(1, cut)}
        </a>,
      )
    } else {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      )
    }
    last = match.index + token.length
    match = scanner.exec(text)
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const FENCE = /^\s*```([\w+#.-]*)\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

/** Block-level markdown → React nodes. */
export function markdownBlocks(text: string): ReactNode[] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let key = 0
  let index = 0

  const takeWhile = (test: (line: string) => RegExpExecArray | null, clean: (line: string) => string) => {
    const items: string[] = []
    while (index < lines.length) {
      const found = test(lines[index])
      if (!found) break
      items.push(clean(lines[index]))
      index += 1
    }
    return items
  }

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1 // closing fence (or the end of the message)
      out.push(
        <pre key={`b${key++}`}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      out.push(
        <p key={`b${key++}`} className="ai-md-h">
          {inlineNodes(heading[2], `h${key}`)}
        </p>,
      )
      index += 1
      continue
    }

    if (BULLET.test(line)) {
      const items = takeWhile(
        (input) => BULLET.exec(input),
        (input) => BULLET.exec(input)![1],
      )
      out.push(
        <ul key={`b${key++}`}>
          {items.map((item, position) => (
            <li key={position}>{inlineNodes(item, `u${key}-${position}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (NUMBERED.test(line)) {
      const items = takeWhile(
        (input) => NUMBERED.exec(input),
        (input) => NUMBERED.exec(input)![1],
      )
      out.push(
        <ol key={`b${key++}`}>
          {items.map((item, position) => (
            <li key={position}>{inlineNodes(item, `o${key}-${position}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (QUOTE.test(line)) {
      const items = takeWhile(
        (input) => QUOTE.exec(input),
        (input) => QUOTE.exec(input)![1],
      )
      out.push(
        <p key={`b${key++}`} className="ai-md-quote">
          {inlineNodes(items.join('\n'), `q${key}`)}
        </p>,
      )
      continue
    }

    // A paragraph runs until a blank line or the start of another block.
    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index]
      if (!current.trim()) break
      if (FENCE.test(current) || BULLET.test(current) || NUMBERED.test(current) || QUOTE.test(current)) break
      if (/^#{1,6}\s+/.test(current)) break
      paragraph.push(current)
      index += 1
    }
    out.push(
      <p key={`b${key++}`}>{inlineNodes(paragraph.join('\n'), `p${key}`)}</p>,
    )
  }

  return out
}

export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => markdownBlocks(text), [text])
  return <div className="ai-md">{blocks}</div>
}
