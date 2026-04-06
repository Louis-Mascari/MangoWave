declare module 'eel-wasm' {
  interface LoadModuleOptions {
    pools: Record<string, Record<string, WebAssembly.Global>>;
    functions: Record<string, { pool: string; code: string }>;
    eelVersion?: 1 | 2;
  }

  export function loadModule(options: LoadModuleOptions): Promise<WebAssembly.Instance>;
}
