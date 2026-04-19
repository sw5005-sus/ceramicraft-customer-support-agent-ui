/**
 * Runtime configuration.
 *
 * Values come from Vite env vars at build time. For Docker deployments,
 * the docker-entrypoint.sh script replaces __PLACEHOLDER__ tokens with
 * runtime env vars before nginx starts.
 *
 * Precedence: runtime placeholder > Vite env var > default.
 */

function resolve(placeholder: string, viteEnv: string | undefined, fallback: string): string {
  // If placeholder was replaced at runtime, use it
  if (placeholder && !placeholder.startsWith('__VITE_')) return placeholder
  // Otherwise use Vite build-time env or fallback
  return viteEnv || fallback
}

export const config = {
  agentBaseUrl: resolve(
    '__VITE_AGENT_BASE_URL__',
    import.meta.env.VITE_AGENT_BASE_URL,
    'http://localhost:8080',
  ),

  zitadel: {
    host: resolve(
      '__VITE_ZITADEL_HOST__',
      import.meta.env.VITE_ZITADEL_HOST,
      'https://cerami-t6ihrd.us1.zitadel.cloud',
    ),
    clientId: resolve(
      '__VITE_ZITADEL_CLIENT_ID__',
      import.meta.env.VITE_ZITADEL_CLIENT_ID,
      '369270211708226724',
    ),
    redirectUri: resolve(
      '__VITE_ZITADEL_REDIRECT_URI__',
      import.meta.env.VITE_ZITADEL_REDIRECT_URI,
      `${window.location.origin}/callback`,
    ),
    scopes: 'openid profile email offline_access urn:zitadel:iam:user:metadata custom:local_userid',
  },

  userMsBaseUrl: resolve(
    '__VITE_USER_MS_BASE_URL__',
    import.meta.env.VITE_USER_MS_BASE_URL,
    'http://localhost:8083',
  ),
} as const
