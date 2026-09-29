/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL da API. Vazio no desenvolvimento (o Vite repassa /api para a API local). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versão enxuta da exifr (só JPEG/HEIC, EXIF e GPS): mesmos tipos do pacote completo. */
declare module 'exifr/dist/lite.esm.mjs' {
  import exifr from 'exifr';
  export default exifr;
}
