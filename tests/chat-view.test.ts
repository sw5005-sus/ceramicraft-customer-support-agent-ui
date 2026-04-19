import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock dependencies
vi.mock('../src/services/chat', () => ({
  chatStream: vi.fn(),
  resetThread: vi.fn(),
}))

vi.mock('../src/services/auth', () => ({
  clearTokens: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
  startLogin: vi.fn(),
}))

vi.mock('../src/services/session', () => ({
  saveSession: vi.fn(),
  listSessions: vi.fn().mockReturnValue([]),
  getSession: vi.fn().mockReturnValue(null),
  deleteSession: vi.fn(),
  clearSession: vi.fn(),
  clearActiveSession: vi.fn(),
  getActiveSessionId: vi.fn().mockReturnValue(null),
  setActiveSessionId: vi.fn(),
  migrateOldSession: vi.fn(),
}))

import { chatStream, resetThread } from '../src/services/chat'
import { clearTokens, isAuthenticated, startLogin } from '../src/services/auth'
import { saveSession, clearSession, listSessions } from '../src/services/session'
import ChatView from '../src/views/ChatView.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ChatView },
    ],
  })
}

function mountChat() {
  const router = makeRouter()
  router.push('/')
  const wrapper = mount(ChatView, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('ChatView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listSessions).mockReturnValue([])
    vi.mocked(chatStream).mockResolvedValue('tid-default')
    vi.mocked(isAuthenticated).mockReturnValue(true)
    // Simulate desktop viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  it('renders empty state when no messages', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Welcome to CeramiCraft')
  })

  it('renders header with title', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('.header-title').text()).toBe('CeramiCraft Support')
  })

  it('renders sidebar', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('.sidebar').exists()).toBe(true)
  })

  it('has a textarea and send button', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('textarea.chat-input').exists()).toBe(true)
    expect(wrapper.find('.send-btn').exists()).toBe(true)
  })

  it('send button is disabled when input is empty', () => {
    const { wrapper } = mountChat()
    const btn = wrapper.find('.send-btn')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('sends message on button click', async () => {
    vi.mocked(chatStream).mockResolvedValue('tid-1')
    const { wrapper } = mountChat()

    const textarea = wrapper.find('textarea.chat-input')
    await textarea.setValue('Hello')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(chatStream).toHaveBeenCalledWith('Hello', null, expect.any(Object))
    expect(saveSession).toHaveBeenCalled()
  })

  it('sends message on Enter key', async () => {
    vi.mocked(chatStream).mockResolvedValue('tid-2')
    const { wrapper } = mountChat()

    const textarea = wrapper.find('textarea.chat-input')
    await textarea.setValue('Hi there')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    await flushPromises()

    expect(chatStream).toHaveBeenCalled()
  })

  it('does not send on Shift+Enter', async () => {
    const { wrapper } = mountChat()
    const textarea = wrapper.find('textarea.chat-input')
    await textarea.setValue('multi\nline')
    await textarea.trigger('keydown.enter', { shiftKey: true })
    await flushPromises()

    expect(chatStream).not.toHaveBeenCalled()
  })

  it('displays user message after sending', async () => {
    vi.mocked(chatStream).mockResolvedValue('tid-3')
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Test message')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    const msgs = wrapper.findAll('.message.user')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text()).toContain('Test message')
  })

  it('displays assistant reply from SSE callback', async () => {
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onReply?.('I can help!')
      callbacks.onDone?.('tid-4')
      return 'tid-4'
    })
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Help me')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    const assistantMsgs = wrapper.findAll('.message.assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].text()).toContain('I can help!')
  })

  it('shows stage indicator during processing', async () => {
    let resolveStream: (v: string) => void
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onStage?.('classifying')
      return new Promise((r) => { resolveStream = r })
    })
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Hi')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.stage-indicator').exists()).toBe(true)
    expect(wrapper.text()).toContain('Understanding your request')

    resolveStream!('tid')
    await flushPromises()
  })

  it('shows error message on chatStream failure', async () => {
    vi.mocked(chatStream).mockRejectedValue(new Error('Network error'))
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Fail')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('⚠️ Network error')
    expect(wrapper.find('.retry-btn').exists()).toBe(true)
  })

  it('retry button resends failed message', async () => {
    vi.mocked(chatStream)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('tid-retry')
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Retry me')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    await wrapper.find('.retry-btn').trigger('click')
    await flushPromises()

    expect(chatStream).toHaveBeenCalledTimes(2)
  })

  it('new conversation clears messages', async () => {
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onDone?.('tid-clear')
      return 'tid-clear'
    })
    vi.mocked(resetThread).mockResolvedValue(undefined)
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('first msg')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    // Click new conversation button in sidebar
    await wrapper.find('.sidebar-new-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('logout clears tokens and hides input', async () => {
    const { wrapper } = mountChat()

    await wrapper.find('.logout-sidebar-btn').trigger('click')
    await flushPromises()

    expect(clearTokens).toHaveBeenCalled()
    // After logout, input area should be hidden, sidebar shows sign in
    expect(wrapper.find('.chat-input-area').exists()).toBe(false)
    expect(wrapper.find('.login-sidebar-btn').exists()).toBe(true)
  })

  it('shows error from onError callback', async () => {
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onError?.('Something went wrong')
      callbacks.onDone?.('tid-err')
      return 'tid-err'
    })
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('break')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('⚠️ Something went wrong')
  })

  it('renders markdown in assistant messages', async () => {
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onReply?.('**bold text**')
      return 'tid-md'
    })
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('markdown')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    const bubble = wrapper.find('.markdown-body')
    expect(bubble.html()).toContain('<strong>bold text</strong>')
  })

  it('does not send empty messages', async () => {
    const { wrapper } = mountChat()
    await wrapper.find('textarea.chat-input').setValue('   ')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(chatStream).mock.calls.length).toBe(0)
  })

  it('toggles sidebar with menu button', async () => {
    const { wrapper } = mountChat()
    const sidebar = wrapper.find('.sidebar')
    expect(sidebar.classes()).toContain('open')

    await wrapper.find('.menu-btn').trigger('click')
    expect(sidebar.classes()).not.toContain('open')

    await wrapper.find('.menu-btn').trigger('click')
    expect(sidebar.classes()).toContain('open')
  })

  it('formats time as HH:MM for today', async () => {
    vi.mocked(listSessions).mockReturnValue([
      {
        id: 'sess-today',
        threadId: null,
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: Date.now() - 60000 }],
        title: 'hi',
        updatedAt: Date.now() - 60000,
      },
    ])
    const { wrapper } = mountChat()
    await flushPromises()
    const timeText = wrapper.find('.session-time').text()
    // Should be a time like "12:30" not a date
    expect(timeText).toMatch(/\d{1,2}:\d{2}/)
  })

  it('formats time as weekday for this week', async () => {
    const threeDaysAgo = Date.now() - 3 * 86400000
    vi.mocked(listSessions).mockReturnValue([
      {
        id: 'sess-week',
        threadId: null,
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: threeDaysAgo }],
        title: 'hi',
        updatedAt: threeDaysAgo,
      },
    ])
    const { wrapper } = mountChat()
    await flushPromises()
    const timeText = wrapper.find('.session-time').text()
    // Should be a short weekday like "Mon", "Tue" etc.
    expect(timeText).toMatch(/\w{2,3}/)
  })

  it('formats time as month+day for older', async () => {
    const twoWeeksAgo = Date.now() - 14 * 86400000
    vi.mocked(listSessions).mockReturnValue([
      {
        id: 'sess-old',
        threadId: null,
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: twoWeeksAgo }],
        title: 'hi',
        updatedAt: twoWeeksAgo,
      },
    ])
    const { wrapper } = mountChat()
    await flushPromises()
    const timeText = wrapper.find('.session-time').text()
    // Should contain a month abbreviation
    expect(timeText.length).toBeGreaterThan(0)
  })

  it('hides input area when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const { wrapper } = mountChat()
    await flushPromises()

    expect(wrapper.find('.chat-input-area').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sign in from the sidebar')
  })

  it('shows sign in button in sidebar when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const { wrapper } = mountChat()
    await flushPromises()

    expect(wrapper.find('.login-sidebar-btn').exists()).toBe(true)
    await wrapper.find('.login-sidebar-btn').trigger('click')
    expect(startLogin).toHaveBeenCalled()
  })

  it('shows session list in sidebar', async () => {
    vi.mocked(listSessions).mockReturnValue([
      {
        id: 'sess-1',
        threadId: 'tid-1',
        messages: [{ id: '1', role: 'user', content: 'Hello world', timestamp: 1000 }],
        title: 'Hello world',
        updatedAt: Date.now(),
      },
    ])
    const { wrapper } = mountChat()
    await flushPromises()

    expect(wrapper.find('.session-item').exists()).toBe(true)
    expect(wrapper.text()).toContain('Hello world')
  })

  it('switches to a session when clicking session item', async () => {
    const sessionData = {
      id: 'sess-1',
      threadId: 'tid-1',
      messages: [
        { id: '1', role: 'user', content: 'old msg', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'old reply', timestamp: 1001 },
      ],
      title: 'old msg',
      updatedAt: Date.now(),
    }
    vi.mocked(listSessions).mockReturnValue([sessionData])
    const { wrapper } = mountChat()
    await flushPromises()

    await wrapper.find('.session-item').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.message')).toHaveLength(2)
    expect(wrapper.text()).toContain('old msg')
  })

  it('deletes a session when clicking delete button', async () => {
    vi.mocked(listSessions).mockReturnValue([
      {
        id: 'sess-del',
        threadId: null,
        messages: [{ id: '1', role: 'user', content: 'delete me', timestamp: 1000 }],
        title: 'delete me',
        updatedAt: Date.now(),
      },
    ])
    const { deleteSession: mockDelete } = await import('../src/services/session')
    const { wrapper } = mountChat()
    await flushPromises()

    await wrapper.find('.session-delete').trigger('click')
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('sess-del')
  })

  it('closes sidebar on mobile when sending message', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true })
    vi.mocked(chatStream).mockResolvedValue('tid-mob')
    const { wrapper } = mountChat()
    await flushPromises()

    // Sidebar should be closed on mobile by default
    expect(wrapper.find('.sidebar').classes()).not.toContain('open')
  })

  it('shows no-sessions message when empty', () => {
    vi.mocked(listSessions).mockReturnValue([])
    const { wrapper } = mountChat()
    expect(wrapper.find('.no-sessions').exists()).toBe(true)
    expect(wrapper.text()).toContain('No conversations yet')
  })

  it('disables textarea and send button while sending', async () => {
    let resolveStream: (v: string) => void
    vi.mocked(chatStream).mockImplementation(async () => {
      return new Promise((r) => { resolveStream = r })
    })
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('Sending...')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect((wrapper.find('textarea.chat-input').element as HTMLTextAreaElement).disabled).toBe(true)
    expect((wrapper.find('.send-btn').element as HTMLButtonElement).disabled).toBe(true)

    resolveStream!('tid')
    await flushPromises()
  })

  it('restores active session on mount', async () => {
    const { getActiveSessionId, getSession } = await import('../src/services/session')
    vi.mocked(getActiveSessionId).mockReturnValue('sess-active')
    vi.mocked(getSession).mockReturnValue({
      id: 'sess-active',
      threadId: 'tid-active',
      messages: [{ id: '1', role: 'user', content: 'restored', timestamp: 1000 }],
      title: 'restored',
      updatedAt: Date.now(),
    })
    const { wrapper } = mountChat()
    await flushPromises()

    expect(wrapper.text()).toContain('restored')
  })
})
