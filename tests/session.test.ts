import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveSession,
  listSessions,
  getSession,
  deleteSession,
  clearSession,
  getActiveSessionId,
  migrateOldSession,
} from '../src/services/session'
import type { ChatMessage } from '../src/types'

describe('session service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty list when no sessions stored', () => {
    expect(listSessions()).toEqual([])
  })

  it('saves and retrieves a session', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hello', timestamp: 1000 },
      { id: '2', role: 'assistant', content: 'hi there', timestamp: 1001 },
    ]
    saveSession('sess-1', 'thread-1', messages)

    const session = getSession('sess-1')
    expect(session).toBeTruthy()
    expect(session!.threadId).toBe('thread-1')
    expect(session!.messages).toHaveLength(2)
    expect(session!.title).toBe('hello')
  })

  it('lists sessions sorted by updatedAt desc', () => {
    saveSession('a', null, [
      { id: '1', role: 'user', content: 'first', timestamp: 1000 },
    ])
    // small delay to ensure different updatedAt
    saveSession('b', null, [
      { id: '2', role: 'user', content: 'second', timestamp: 2000 },
    ])

    const list = listSessions()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('b')
  })

  it('saves null threadId', () => {
    saveSession('sess-1', null, [])
    const session = getSession('sess-1')
    expect(session!.threadId).toBeNull()
  })

  it('truncates to 100 messages', () => {
    const messages: ChatMessage[] = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: `msg ${i}`,
      timestamp: i,
    }))
    saveSession('sess-1', 'tid', messages)

    const session = getSession('sess-1')
    expect(session!.messages).toHaveLength(100)
    expect(session!.messages[0].content).toBe('msg 50')
  })

  it('generates title from first user message', () => {
    saveSession('sess-1', null, [
      {
        id: '1',
        role: 'user',
        content: 'This is a very long message that should be truncated at thirty characters',
        timestamp: 1000,
      },
    ])
    const session = getSession('sess-1')
    expect(session!.title.length).toBeLessThanOrEqual(31) // 30 + ellipsis char
  })

  it('deletes a session', () => {
    saveSession('sess-1', null, [])
    saveSession('sess-2', null, [])
    deleteSession('sess-1')
    expect(getSession('sess-1')).toBeNull()
    expect(getSession('sess-2')).toBeTruthy()
  })

  it('sets active session id on save', () => {
    saveSession('sess-1', null, [])
    expect(getActiveSessionId()).toBe('sess-1')
  })

  it('clears active session', () => {
    saveSession('sess-1', null, [])
    clearSession()
    expect(getActiveSessionId()).toBeNull()
  })

  it('migrates old single-session format', () => {
    const oldData = JSON.stringify({
      threadId: 'old-thread',
      messages: [
        { id: '1', role: 'user', content: 'old message', timestamp: 1000 },
      ],
      updatedAt: Date.now(),
    })
    localStorage.setItem('ceramicraft_chat_session', oldData)

    migrateOldSession()

    // Old key should be removed
    expect(localStorage.getItem('ceramicraft_chat_session')).toBeNull()
    // New sessions should have the migrated data
    const list = listSessions()
    expect(list).toHaveLength(1)
    expect(list[0].threadId).toBe('old-thread')
    expect(list[0].messages[0].content).toBe('old message')
  })

  it('handles corrupted data gracefully', () => {
    localStorage.setItem('ceramicraft_chat_sessions', 'not-json')
    expect(listSessions()).toEqual([])
  })
})
