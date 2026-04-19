/**
 * Multi-conversation session persistence using localStorage.
 *
 * Stores multiple conversations so users can switch between them.
 * Each conversation has its own thread_id and message history.
 */

import type { ChatMessage } from '../types'

const SESSIONS_KEY = 'ceramicraft_chat_sessions'
const ACTIVE_KEY = 'ceramicraft_active_session'
const MAX_SESSIONS = 50
const MAX_MESSAGES_PER_SESSION = 100

export interface ConversationSession {
  id: string
  threadId: string | null
  messages: ChatMessage[]
  title: string
  updatedAt: number
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New Conversation'
  const text = firstUser.content.trim()
  return text.length > 30 ? text.slice(0, 30) + '…' : text
}

function loadAllSessions(): ConversationSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as ConversationSession[]
  } catch {
    return []
  }
}

function saveAllSessions(sessions: ConversationSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // Storage full — silently fail
  }
}

export function listSessions(): ConversationSession[] {
  return loadAllSessions().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(id: string): ConversationSession | null {
  return loadAllSessions().find((s) => s.id === id) ?? null
}

export function saveSession(
  sessionId: string,
  threadId: string | null,
  messages: ChatMessage[],
): void {
  const sessions = loadAllSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  const trimmed = messages.slice(-MAX_MESSAGES_PER_SESSION)
  const session: ConversationSession = {
    id: sessionId,
    threadId,
    messages: trimmed,
    title: generateTitle(trimmed),
    updatedAt: Date.now(),
  }

  if (idx >= 0) {
    sessions[idx] = session
  } else {
    sessions.unshift(session)
    // Trim oldest if over limit
    if (sessions.length > MAX_SESSIONS) {
      sessions.splice(MAX_SESSIONS)
    }
  }

  saveAllSessions(sessions)
  setActiveSessionId(sessionId)
}

export function deleteSession(id: string): void {
  const sessions = loadAllSessions().filter((s) => s.id !== id)
  saveAllSessions(sessions)
  if (getActiveSessionId() === id) {
    clearActiveSession()
  }
}

export function clearSession(): void {
  // Only clears active pointer, not the stored session
  clearActiveSession()
}

export function getActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveSessionId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

export function clearActiveSession(): void {
  localStorage.removeItem(ACTIVE_KEY)
}

// Migration: convert old single-session format to new multi-session
export function migrateOldSession(): void {
  const oldKey = 'ceramicraft_chat_session'
  const raw = localStorage.getItem(oldKey)
  if (!raw) return
  try {
    const old = JSON.parse(raw) as {
      threadId: string | null
      messages: ChatMessage[]
      updatedAt: number
    }
    if (old.messages?.length) {
      const id = crypto.randomUUID()
      saveSession(id, old.threadId, old.messages)
    }
    localStorage.removeItem(oldKey)
  } catch {
    localStorage.removeItem(oldKey)
  }
}
