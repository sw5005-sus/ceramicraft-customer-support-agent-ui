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
}))

vi.mock('../src/services/session', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn().mockReturnValue(null),
  clearSession: vi.fn(),
}))

import { chatStream, resetThread } from '../src/services/chat'
import { clearTokens } from '../src/services/auth'
import { loadSession, saveSession, clearSession } from '../src/services/session'
import ChatView from '../src/views/ChatView.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ChatView },
      { path: '/login', component: { template: '<div>login</div>' } },
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
    vi.mocked(loadSession).mockReturnValue(null)
    vi.mocked(chatStream).mockResolvedValue('tid-default')
  })

  it('renders empty state when no messages', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Welcome to CeramiCraft')
  })

  it('renders header with title and buttons', () => {
    const { wrapper } = mountChat()
    expect(wrapper.find('.header-title').text()).toBe('CeramiCraft Support')
    expect(wrapper.findAll('.action-btn')).toHaveLength(2)
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

    // Only the default mock setup, no actual call from this test
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

  it('new conversation clears messages and calls resetThread', async () => {
    vi.mocked(chatStream).mockImplementation(async (_msg, _tid, callbacks) => {
      callbacks.onDone?.('tid-clear')
      return 'tid-clear'
    })
    vi.mocked(resetThread).mockResolvedValue(undefined)
    const { wrapper } = mountChat()

    await wrapper.find('textarea.chat-input').setValue('first msg')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    // Click new conversation button (first action-btn)
    const newBtn = wrapper.findAll('.action-btn')[0]
    await newBtn.trigger('click')
    await flushPromises()

    expect(resetThread).toHaveBeenCalledWith('tid-clear')
    expect(clearSession).toHaveBeenCalled()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('logout clears tokens and redirects to /login', async () => {
    const { wrapper, router } = mountChat()

    const logoutBtn = wrapper.findAll('.action-btn')[1]
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(clearTokens).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('restores session from localStorage on mount', async () => {
    vi.mocked(loadSession).mockReturnValue({
      threadId: 'saved-tid',
      messages: [
        { id: '1', role: 'user', content: 'saved msg', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'saved reply', timestamp: 1001 },
      ],
    })
    const { wrapper } = mountChat()
    await flushPromises()

    expect(wrapper.findAll('.message')).toHaveLength(2)
    expect(wrapper.text()).toContain('saved msg')
    expect(wrapper.text()).toContain('saved reply')
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

    // chatStream should not have been called for whitespace-only input
    expect(vi.mocked(chatStream).mock.calls.length).toBe(0)
  })
})
