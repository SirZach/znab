/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Dev API port (default 3002). Unused in a build, which calls its own origin. */
  readonly VITE_API_PORT?: string;
}
