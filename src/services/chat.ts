/**
 * Chat service — communicates with the CS Agent backend.
 *
 * Supports both synchronous (/chat) and streaming (/chat/stream) endpoints.
 */

import { config } from './config'
import { getIdToken } from './auth'
import type { AgentStage } from '../types'

interface ChatCallbacks {
  onStage?: (stage: AgentStage, data: Record<string, unknown>) => void
  onReply?: (content: string) => void
  onError?: (message: string) => void
  onDone?: (threadId: string) => void
}

/**
 * Send a message via SSE streaming endpoint.
 *
 * Returns the thread_id from the done event.
 */
export async function chatStream(
  message: string,
  threadId: string | null,
  callbacks: ChatCallbacks,
): Promise<string> {
  const token = await getIdToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const body: Record<string, unknown> = { message }
  if (threadId) {
    body.thread_id = threadId
  }

  const resp = await fetch(`${config.agentBaseUrl}/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Chat request failed: ${resp.status} ${text}`)
  }

  const reader = resp.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let resultThreadId = threadId || ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Parse SSE events from buffer
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete last line

    let currentEvent = ''
    let currentData = ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7)
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6)
      } else if (line === '' && currentEvent) {
        // End of event
        try {
          const data = JSON.parse(currentData) as Record<string, unknown>

          switch (currentEvent) {
            case 'guarding':
              callbacks.onStage?.('guarding', data)
              break
            case 'classifying':
              callbacks.onStage?.('classifying', data)
              break
            case 'processing':
              callbacks.onStage?.('processing', data)
              break
            case 'reply':
              callbacks.onReply?.((data.content as string) || '')
              break
            case 'error':
              callbacks.onError?.((data.message as string) || 'Unknown error')
              break
            case 'done':
              resultThreadId = (data.thread_id as string) || resultThreadId
              callbacks.onDone?.(resultThreadId)
              break
          }
        } catch {
          // Skip malformed events
        }
        currentEvent = ''
        currentData = ''
      }
    }
  }

  return resultThreadId
}

/** Reset a conversation thread. */
export async function resetThread(threadId: string): Promise<void> {
  const token = await getIdToken()

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const resp = await fetch(
    `${config.agentBaseUrl}/reset?thread_id=${encodeURIComponent(threadId)}`,
    { method: 'POST', headers },
  )

  if (!resp.ok) {
    throw new Error(`Reset failed: ${resp.status}`)
  }
}
