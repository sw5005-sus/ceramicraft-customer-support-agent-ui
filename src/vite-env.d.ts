/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_BASE_URL: string
  readonly VITE_ZITADEL_HOST: string
  readonly VITE_ZITADEL_CLIENT_ID: string
  readonly VITE_ZITADEL_REDIRECT_URI: string
  readonly VITE_USER_MS_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
