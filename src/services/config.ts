/** Runtime configuration — loaded from environment variables at build time. */
export const config = {
  /** CS Agent backend base URL. */
  agentBaseUrl: import.meta.env.VITE_AGENT_BASE_URL as string || 'http://localhost:8080',

  /** Zitadel OIDC configuration. */
  zitadel: {
    host: import.meta.env.VITE_ZITADEL_HOST as string || 'https://cerami-t6ihrd.us1.zitadel.cloud',
    clientId: import.meta.env.VITE_ZITADEL_CLIENT_ID as string || '361761429302373082',
    redirectUri: import.meta.env.VITE_ZITADEL_REDIRECT_URI as string || `${window.location.origin}/callback`,
    scopes: 'openid profile email offline_access urn:zitadel:iam:user:metadata custom:local_userid',
  },

  /** User-ms base URL for oauth-callback registration. */
  userMsBaseUrl: import.meta.env.VITE_USER_MS_BASE_URL as string || 'http://localhost:8083',
} as const
