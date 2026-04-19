import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/services/auth', () => ({
  isAuthenticated: vi.fn().mockReturnValue(false),
  startLogin: vi.fn(),
  clearTokens: vi.fn(),
}))

import router from '../src/router'

describe('router', () => {
  it('/ resolves to Chat route', async () => {
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('Chat')
  })

  it('/callback resolves to Callback route', async () => {
    await router.push('/callback')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('Callback')
  })
})
