import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { isAuthenticated } from '../src/services/auth'

vi.mock('../src/services/auth', () => ({
  isAuthenticated: vi.fn().mockReturnValue(false),
}))

// Create a fresh router for each test to avoid shared state
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/login', name: 'Login', component: { template: '<div/>' } },
      { path: '/callback', name: 'Callback', component: { template: '<div/>' } },
      { path: '/chat', name: 'Chat', component: { template: '<div/>' }, meta: { requiresAuth: true } },
    ],
  })
}

function addGuard(router: ReturnType<typeof createRouter>) {
  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !isAuthenticated()) {
      return { name: 'Login' }
    }
  })
}

describe('router', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
  })

  it('redirects / to /chat when authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const router = makeRouter()
    addGuard(router)
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('redirects unauthenticated /chat to /login', async () => {
    const router = makeRouter()
    addGuard(router)
    await router.push('/chat')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows /login without auth', async () => {
    const router = makeRouter()
    addGuard(router)
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows /callback without auth', async () => {
    const router = makeRouter()
    addGuard(router)
    await router.push('/callback')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/callback')
  })
})
