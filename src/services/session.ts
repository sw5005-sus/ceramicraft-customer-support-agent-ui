/**
 * Lightweight session persistence using localStorage.
 *
 * Saves the current thread_id and messages so the user can
 * resume their conversation after page refresh.
 */

import type { ChatMessage } from '../types'

const SESSION_KEY = 'ceramicraft_chat_session'
const MAX_STORED_MESSAGES = 100

interface StoredSession {
  threadId: string | null
  messages: ChatMessage[]
  updatedAt: number
}

export function saveSession(threadId: string | null, messages: ChatMessage[]): void {
  const session: StoredSession = {
    threadId,
    messages: messages.slice(-MAX_STORED_MESSAGES),
    updatedAt: Date.now(),
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage full — silently fail
  }
}

export function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
