import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getStoredTokens,
  clearTokens,
  isAuthenticated,
  getIdToken,
  startLogin,
  handleCallback,
  refreshTokens,
} from '../src/services/auth'

// Mock config
vi.mock('../src/services/config', () => ({
  config: {
    zitadel: {
      host: 'https://zitadel.example.com',
      clientId: 'test-client-id',
      redirectUri: 'http://localhost:5173/callback',
      scopes: 'openid profile',
    },
    userMsBaseUrl: 'http://localhost:8083',
  },
}))

describe('auth service', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe('token storage', () => {
    it('returns null when no tokens stored', () => {
      expect(getStoredTokens()).toBeNull()
    })

    it('stores and retrieves tokens', () => {
      const tokens = { idToken: 'id123', refreshToken: 'ref456', expiresAt: Date.now() + 3600000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))
      const result = getStoredTokens()
      expect(result).toEqual(tokens)
    })

    it('returns null for corrupted storage', () => {
      localStorage.setItem('ceramicraft_tokens', 'not-json')
      expect(getStoredTokens()).toBeNull()
    })

    it('clearTokens removes all auth data', () => {
      localStorage.setItem('ceramicraft_tokens', '{}')
      sessionStorage.setItem('pkce_code_verifier', 'v')
      sessionStorage.setItem('pkce_state', 's')
      clearTokens()
      expect(localStorage.getItem('ceramicraft_tokens')).toBeNull()
      expect(sessionStorage.getItem('pkce_code_verifier')).toBeNull()
      expect(sessionStorage.getItem('pkce_state')).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('returns false when no tokens', () => {
      expect(isAuthenticated()).toBe(false)
    })

    it('returns true when tokens are valid', () => {
      const tokens = { idToken: 'id', refreshToken: 'ref', expiresAt: Date.now() + 300000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))
      expect(isAuthenticated()).toBe(true)
    })

    it('returns false when tokens are expired', () => {
      const tokens = { idToken: 'id', refreshToken: 'ref', expiresAt: Date.now() - 1000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))
      expect(isAuthenticated()).toBe(false)
    })

    it('returns false within 60s buffer of expiry', () => {
      const tokens = { idToken: 'id', refreshToken: 'ref', expiresAt: Date.now() + 30000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))
      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('getIdToken', () => {
    it('returns null when no tokens', async () => {
      expect(await getIdToken()).toBeNull()
    })

    it('returns token when not expired', async () => {
      const tokens = { idToken: 'my-id-token', refreshToken: 'ref', expiresAt: Date.now() + 300000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))
      expect(await getIdToken()).toBe('my-id-token')
    })

    it('attempts refresh when near expiry', async () => {
      const tokens = { idToken: 'old', refreshToken: 'ref', expiresAt: Date.now() + 10000 }
      localStorage.setItem('ceramicraft_tokens', JSON.stringify(tokens))

      // Mock failed refresh
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
      const result = await getIdToken()
      expect(result).toBeNull()
    })
  })

  describe('startLogin', () => {
    it('stores PKCE verifier and state in sessionStorage', async () => {
      // Mock window.location.href setter
      const hrefSetter = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...window.location, origin: 'http://localhost:5173' },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window.location, 'href', {
        set: hrefSetter,
        configurable: true,
      })

      await startLogin()
      expect(sessionStorage.getItem('pkce_code_verifier')).toBeTruthy()
      expect(sessionStorage.getItem('pkce_state')).toBeTruthy()
      expect(hrefSetter).toHaveBeenCalledOnce()
      const url = hrefSetter.mock.calls[0][0] as string
      expect(url).toContain('zitadel.example.com/oauth/v2/authorize')
      expect(url).toContain('code_challenge_method=S256')
    })
  })

  describe('handleCallback', () => {
    it('throws on state mismatch', async () => {
      sessionStorage.setItem('pkce_state', 'correct')
      await expect(handleCallback('code', 'wrong')).rejects.toThrow('state mismatch')
    })

    it('throws when no code verifier', async () => {
      sessionStorage.setItem('pkce_state', 'mystate')
      await expect(handleCallback('code', 'mystate')).rejects.toThrow('Missing PKCE code verifier')
    })

    it('exchanges code for tokens', async () => {
      sessionStorage.setItem('pkce_state', 'mystate')
      sessionStorage.setItem('pkce_code_verifier', 'myverifier')

      const tokenResponse = {
        access_token: 'access123',
        id_token: 'id123',
        refresh_token: 'ref456',
        expires_in: 3600,
      }

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(tokenResponse), { status: 200 }))
        // oauth-callback
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        // refresh to get updated id_token
        .mockResolvedValueOnce(new Response(JSON.stringify({ ...tokenResponse, id_token: 'refreshed-id' }), { status: 200 }))

      const result = await handleCallback('code123', 'mystate')
      expect(result.idToken).toBe('refreshed-id')
      expect(result.refreshToken).toBe('ref456')
      expect(getStoredTokens()).toBeTruthy()
      expect(sessionStorage.getItem('pkce_code_verifier')).toBeNull()
    })

    it('throws on token exchange failure', async () => {
      sessionStorage.setItem('pkce_state', 'mystate')
      sessionStorage.setItem('pkce_code_verifier', 'myverifier')

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('bad request', { status: 400 }),
      )

      await expect(handleCallback('code', 'mystate')).rejects.toThrow('Token exchange failed')
    })
  })

  describe('refreshTokens', () => {
    it('returns null when no stored tokens', async () => {
      expect(await refreshTokens()).toBeNull()
    })

    it('returns null when no refresh token', async () => {
      localStorage.setItem('ceramicraft_tokens', JSON.stringify({ idToken: 'id', refreshToken: '', expiresAt: 0 }))
      expect(await refreshTokens()).toBeNull()
    })

    it('refreshes and stores new tokens', async () => {
      localStorage.setItem('ceramicraft_tokens', JSON.stringify({ idToken: 'old', refreshToken: 'ref', expiresAt: 0 }))

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: 'new-id', refresh_token: 'new-ref', expires_in: 3600 }), { status: 200 }),
      )

      const result = await refreshTokens()
      expect(result?.idToken).toBe('new-id')
      expect(result?.refreshToken).toBe('new-ref')
    })

    it('clears tokens on refresh failure', async () => {
      localStorage.setItem('ceramicraft_tokens', JSON.stringify({ idToken: 'old', refreshToken: 'ref', expiresAt: 0 }))

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 401 }),
      )

      const result = await refreshTokens()
      expect(result).toBeNull()
      expect(getStoredTokens()).toBeNull()
    })
  })
})
