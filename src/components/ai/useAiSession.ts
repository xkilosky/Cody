/**
 * The state machine behind the Build AI section: one thread, one run at a time.
 *
 * The orchestration itself lives in `lib/ai/crew.ts` (no React, fully testable);
 * this hook only listens to its events and keeps the transcript, the activity
 * list, the stop signal and the "undo this run" snapshot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiConfig } from '../../lib/ai/config'
import type { Speaker, Turn } from '../../lib/ai/crew'
import { runAgent, runChat } from '../../lib/ai/crew'
import type { ToolCall, ToolWorkspace } from '../../lib/ai/tools'
import { uid } from '../../lib/utils'

export type AiMode = 'chat' | 'crew'

export type UiTurn = {
  id: string
  /** Which renderer the row gets. */
  kind: 'user' | 'agent' | 'note' | 'error' | 'summary'
  speaker: Speaker
  label: string
  text: string
  /** "grok-4.7 · xkiro" — the model that actually answered. */
  model?: string
  at: number
}

export type Activity = { id: string; tool: string; summary: string; ok: boolean }

export type PendingApproval = { call: ToolCall; resolve: (allowed: boolean) => void } | null

export type AiSession = ReturnType<typeof useAiSession>

type Options = {
  config: AiConfig
  keys: Record<string, string | undefined>
  workspace: ToolWorkspace
}

export function useAiSession({ config, keys, workspace }: Options) {
  const [mode, setMode] = useState<AiMode>('chat')
  const [turns, setTurns] = useState<UiTurn[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [approval, setApproval] = useState<PendingApproval>(null)
  const [canRevert, setCanRevert] = useState(false)

  const abort = useRef<AbortController | null>(null)
  const snapshot = useRef<{ id: string; name: string; files: { path: string; content: string }[]; folders: string[] } | null>(null)
  const createdProjects = useRef<string[]>([])
  const turnsRef = useRef<UiTurn[]>([])

  turnsRef.current = turns

  useEffect(() => () => abort.current?.abort(), [])

  const push = useCallback((turn: Omit<UiTurn, 'id' | 'at'>) => {
    const next: UiTurn = { ...turn, id: uid('ai_'), at: Date.now() }
    setTurns((prev) => [...prev, next])
    return next
  }, [])

  const history = useMemo<Turn[]>(
    () =>
      turns
        .filter((turn) => turn.kind === 'user' || turn.kind === 'agent')
        .map((turn) => ({ speaker: turn.speaker, label: turn.label, text: turn.text })),
    [turns],
  )

  const send = useCallback(
    async (text: string, nextMode: AiMode = mode) => {
      const task = text.trim()
      if (!task || running) return
      setError(null)
      setSummary(null)
      setActivity([])
      push({ kind: 'user', speaker: 'user', label: 'You', text: task })

      const before = await workspace.snapshot()
      snapshot.current = before
      const known = new Set(workspace.listProjects().map((project) => project.id))
      setCanRevert(Boolean(before))

      const controller = new AbortController()
      abort.current = controller
      setRunning(true)
      const historyForRun = turnsRef.current
        .filter((turn) => turn.kind === 'user' || turn.kind === 'agent')
        .slice(-12)
        .map((turn) => ({ speaker: turn.speaker, label: turn.label, text: turn.text }))

      try {
        const runner = nextMode === 'crew' ? runAgent : runChat
        const result = await runner({
          config,
          keys,
          workspace,
          task,
          history: historyForRun,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.kind) {
              case 'thinking':
                setStatus(`${event.label} is working…`)
                break
              case 'tool':
                setActivity((prev) => [
                  ...prev,
                  { id: uid('act_'), tool: event.call.tool, summary: event.result.summary, ok: event.result.ok },
                ])
                break
              case 'skipped':
                setActivity((prev) => [
                  ...prev,
                  { id: uid('act_'), tool: event.call.tool, summary: `skipped — ${event.reason}`, ok: false },
                ])
                break
              case 'fallback':
                push({ kind: 'note', speaker: 'system', label: 'Fallback', text: event.message })
                break
              case 'message':
                if (event.text.trim()) {
                  push({
                    kind: 'agent',
                    speaker: event.speaker,
                    label: event.label,
                    text: event.text,
                    model: event.target ? `${event.target.label ?? event.target.model} · ${event.target.provider}` : undefined,
                  })
                }
                break
              case 'done':
                if (event.summary) {
                  setSummary(event.summary)
                  push({ kind: 'summary', speaker: 'system', label: 'Done', text: event.summary })
                }
                break
              case 'error':
                setError(event.message)
                push({ kind: 'error', speaker: event.speaker, label: 'Cody', text: event.message })
                break
              case 'stopped':
                push({ kind: 'note', speaker: 'system', label: 'Stopped', text: 'You stopped the run.' })
                break
              default:
                break
            }
          },
          approve: (call) =>
            new Promise<boolean>((resolve) => {
              setApproval({
                call,
                resolve: (allowed) => {
                  setApproval(null)
                  resolve(allowed)
                },
              })
            }),
        })

        // Anything the crew created is remembered so "undo" can remove it too.
        const after = workspace.listProjects()
        createdProjects.current = after.map((project) => project.id).filter((id) => !known.has(id))
        if (result.error) setError(result.error)
        if (result.summary) setSummary(result.summary)
      } catch (failure) {
        const message = (failure as Error)?.message ?? String(failure)
        if (message !== 'Stopped') {
          setError(message)
          push({ kind: 'error', speaker: 'assistant', label: 'Cody', text: message })
        }
      } finally {
        setRunning(false)
        setStatus(null)
        abort.current = null
      }
    },
    [config, keys, mode, push, running, workspace],
  )

  const stop = useCallback(() => {
    abort.current?.abort()
    setStatus(null)
  }, [])

  const clear = useCallback(() => {
    setTurns([])
    setActivity([])
    setError(null)
    setSummary(null)
    setCanRevert(false)
  }, [])

  const revert = useCallback(async () => {
    const saved = snapshot.current
    if (!saved) return
    await workspace.restore(saved, createdProjects.current)
    setCanRevert(false)
    snapshot.current = null
    push({ kind: 'note', speaker: 'system', label: 'Reverted', text: `Restored “${saved.name}” to how it was before this run.` })
  }, [push, workspace])

  const respondToApproval = useCallback(
    (allowed: boolean) => {
      approval?.resolve(allowed)
    },
    [approval],
  )

  /** Called when the config changes, so a stale "no key" message clears. */
  const resetError = useCallback(() => setError(null), [])

  return {
    mode,
    setMode,
    turns,
    activity,
    running,
    status,
    error,
    summary,
    approval,
    respondToApproval,
    canRevert,
    send,
    stop,
    clear,
    revert,
    resetError,
  }
}
