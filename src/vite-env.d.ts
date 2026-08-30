/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENCRYPTION_KEY?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_ADMIN_PASSWORD_SHA256?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
