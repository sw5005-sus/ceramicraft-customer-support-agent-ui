/**
 * Zitadel PKCE OAuth authentication service.
 *
 * Implements the Authorization Code flow with PKCE (S256)
 * matching the mobile app's login flow.
 */

import { config } from './config'
import type { TokenPair } from '../types'

const TOKEN_KEY = 'ceramicraft_tokens'

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 128)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// --- Token storage ---

export function getStoredTokens(): TokenPair | null {
  const raw = localStorage.getItem(TOKEN_KEY)
  if (!raw) return null
  try {
    const tokens: TokenPair = JSON.parse(raw)
    return tokens
  } catch {
    return null
  }
}

function storeTokens(tokens: TokenPair): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem('pkce_code_verifier')
  sessionStorage.removeItem('pkce_state')
}

// --- Auth flow ---

/** Redirect the user to Zitadel login page. */
export async function startLogin(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state = generateState()

  // Store for callback
  sessionStorage.setItem('pkce_code_verifier', verifier)
  sessionStorage.setItem('pkce_state', state)

  const params = new URLSearchParams({
    client_id: config.zitadel.clientId,
    redirect_uri: config.zitadel.redirectUri,
    response_type: 'code',
    scope: config.zitadel.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.href = `${config.zitadel.host}/oauth/v2/authorize?${params}`
}

/** Handle the OAuth callback: exchange code for tokens. */
export async function handleCallback(code: string, state: string): Promise<TokenPair> {
  const savedState = sessionStorage.getItem('pkce_state')
  if (state !== savedState) {
    throw new Error('OAuth state mismatch')
  }

  const verifier = sessionStorage.getItem('pkce_code_verifier')
  if (!verifier) {
    throw new Error('Missing PKCE code verifier')
  }

  // Exchange code for tokens
  const resp = await fetch(`${config.zitadel.host}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.zitadel.clientId,
      code,
      redirect_uri: config.zitadel.redirectUri,
      code_verifier: verifier,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = await resp.json()
  const accessToken = data.access_token as string

  // Register user via user-ms oauth-callback
  await fetch(`${config.userMsBaseUrl}/user-ms/v1/customer/oauth-callback`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {
    // User may already exist — non-fatal
  })

  // Refresh token to get id_token with local_userid metadata
  let idToken = (data.id_token || '') as string
  const refreshToken = (data.refresh_token || '') as string

  if (refreshToken) {
    try {
      const refreshResp = await fetch(`${config.zitadel.host}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.zitadel.clientId,
          refresh_token: refreshToken,
        }),
      })
      if (refreshResp.ok) {
        const refreshData = await refreshResp.json()
        idToken = (refreshData.id_token || idToken) as string
      }
    } catch {
      // Use initial token
    }
  }

  const tokens: TokenPair = {
    idToken,
    refreshToken,
    expiresAt: Date.now() + (data.expires_in as number || 3600) * 1000,
  }

  storeTokens(tokens)
  sessionStorage.removeItem('pkce_code_verifier')
  sessionStorage.removeItem('pkce_state')

  return tokens
}

/** Refresh the id_token using the stored refresh_token. */
export async function refreshTokens(): Promise<TokenPair | null> {
  const stored = getStoredTokens()
  if (!stored?.refreshToken) return null

  try {
    const resp = await fetch(`${config.zitadel.host}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.zitadel.clientId,
        refresh_token: stored.refreshToken,
      }),
    })

    if (!resp.ok) {
      clearTokens()
      return null
    }

    const data = await resp.json()
    const tokens: TokenPair = {
      idToken: (data.id_token || stored.idToken) as string,
      refreshToken: (data.refresh_token || stored.refreshToken) as string,
      expiresAt: Date.now() + (data.expires_in as number || 3600) * 1000,
    }

    storeTokens(tokens)
    return tokens
  } catch {
    clearTokens()
    return null
  }
}

/** Check if user is authenticated (has non-expired tokens). */
export function isAuthenticated(): boolean {
  const tokens = getStoredTokens()
  if (!tokens) return false
  // Allow 60s buffer before expiry
  return Date.now() < tokens.expiresAt - 60_000
}

/** Get the current id_token, refreshing if needed. */
export async function getIdToken(): Promise<string | null> {
  const tokens = getStoredTokens()
  if (!tokens) return null

  if (Date.now() >= tokens.expiresAt - 60_000) {
    const refreshed = await refreshTokens()
    return refreshed?.idToken || null
  }

  return tokens.idToken
}
