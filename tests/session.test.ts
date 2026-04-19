import { describe, it, expect, beforeEach } from 'vitest'
import { saveSession, loadSession, clearSession } from '../src/services/session'
import type { ChatMessage } from '../src/types'

describe('session service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when no session stored', () => {
    expect(loadSession()).toBeNull()
  })

  it('saves and loads a session', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hello', timestamp: 1000 },
      { id: '2', role: 'assistant', content: 'hi there', timestamp: 1001 },
    ]
    saveSession('thread-1', messages)

    const loaded = loadSession()
    expect(loaded).toBeTruthy()
    expect(loaded!.threadId).toBe('thread-1')
    expect(loaded!.messages).toHaveLength(2)
    expect(loaded!.messages[0].content).toBe('hello')
  })

  it('saves null threadId', () => {
    saveSession(null, [])
    const loaded = loadSession()
    expect(loaded!.threadId).toBeNull()
  })

  it('truncates to 100 messages', () => {
    const messages: ChatMessage[] = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: `msg ${i}`,
      timestamp: i,
    }))
    saveSession('tid', messages)

    const loaded = loadSession()
    expect(loaded!.messages).toHaveLength(100)
    // Should keep the last 100
    expect(loaded!.messages[0].content).toBe('msg 50')
  })

  it('clears session', () => {
    saveSession('tid', [])
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('returns null for corrupted data', () => {
    localStorage.setItem('ceramicraft_chat_session', 'not-json')
    expect(loadSession()).toBeNull()
  })
})
