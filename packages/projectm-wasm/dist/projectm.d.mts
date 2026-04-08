// Type declaration for the Emscripten-generated module factory.
// The actual module shape is typed in src/index.ts (EmscriptenModule interface).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function createProjectMModule(opts?: Record<string, unknown>): Promise<any>;
export default createProjectMModule;
