/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL da API. Vazio no desenvolvimento (o Vite repassa /api para a API local). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
