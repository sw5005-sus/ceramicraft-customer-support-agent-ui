import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock auth
vi.mock('../src/services/auth', () => ({
  handleCallback: vi.fn(),
}))

import { handleCallback } from '../src/services/auth'
import CallbackView from '../src/views/CallbackView.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/callback', component: CallbackView },
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/chat', component: { template: '<div>chat</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })
}

describe('CallbackView.vue', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows spinner while loading', () => {
    // No code/state in URL
    const router = makeRouter()
    const wrapper = mount(CallbackView, { global: { plugins: [router] } })
    expect(wrapper.find('.spinner').exists()).toBe(true)
    expect(wrapper.text()).toContain('Signing you in')
  })

  it('shows error when code is missing', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    })

    const router = makeRouter()
    const wrapper = mount(CallbackView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.error').text()).toContain('Missing authorization code')
  })

  it('shows error when handleCallback fails', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?code=abc&state=xyz' },
      writable: true,
      configurable: true,
    })
    vi.mocked(handleCallback).mockRejectedValue(new Error('Invalid state'))

    const router = makeRouter()
    const wrapper = mount(CallbackView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.error').text()).toContain('Invalid state')
  })

  it('redirects to /chat on success', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?code=abc&state=xyz' },
      writable: true,
      configurable: true,
    })
    vi.mocked(handleCallback).mockResolvedValue({ idToken: 'id', refreshToken: 'ref', expiresAt: Date.now() + 3600000 })

    const router = makeRouter()
    router.push('/callback?code=abc&state=xyz')
    await router.isReady()

    mount(CallbackView, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('shows back to login button on error', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    })

    const router = makeRouter()
    const wrapper = mount(CallbackView, { global: { plugins: [router] } })
    await flushPromises()

    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('Back to login')
  })
})
