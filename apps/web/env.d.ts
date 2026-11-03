/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of apps/server. Defaults to "/api", which the Vite dev server proxies to localhost:8080. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
