interface ImportMetaEnv {
  readonly VITE_MAPBOX_PUBLIC_TOKEN?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
