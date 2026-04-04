/**
 * Dev-only shader diagnostics for QA.
 *
 * Monkey-patches WebGL2RenderingContext to intercept compileShader / linkProgram
 * and log failures keyed to the current preset name.
 *
 * Gated behind `import.meta.env.DEV` — tree-shaken from production builds.
 *
 * Usage:
 *   1. `installShaderDiagnostics()` is called in App.tsx (dev-only guard).
 *   2. `setDiagnosticPresetName(name)` is called on every preset change.
 *   3. Blast through presets (autopilot at 2-3s).
 *   4. Call `__mwShaderQA.getFailures()` in the console to get the full report.
 */

interface ShaderFailure {
  preset: string;
  stage: 'compile' | 'link';
  shaderType: 'VERTEX' | 'FRAGMENT' | 'unknown';
  error: string;
}

let currentPreset = '(unknown)';
const failures: ShaderFailure[] = [];
const failedPresets = new Set<string>();
let installed = false;

let presetCount = 0;

// Shader source capture — stores the last fragment shader source per preset
const shaderSources: Map<string, { warpFrag?: string; compFrag?: string }> = new Map();
let capturePhase: 'warp' | 'comp' | 'other' = 'other';
let fragmentSourcePending: string | null = null;

export function setDiagnosticPresetName(name: string): void {
  if (!installed) return;
  currentPreset = name;
  presetCount++;
  console.log(`[MW-QA] #${presetCount} Loaded: "${name}"`);
}

function getShaderFailures(): { failures: ShaderFailure[]; summary: string } {
  const unique = new Set(failures.map((f) => f.preset));
  return {
    failures,
    summary: `${failures.length} shader errors across ${unique.size} presets (of ${failedPresets.size} unique failing presets)`,
  };
}

export function installShaderDiagnostics(): void {
  if (installed) return;
  installed = true;

  const proto = WebGL2RenderingContext.prototype;

  // --- shaderSource (capture fragment sources for debugging) ---
  const origShaderSource = proto.shaderSource;
  proto.shaderSource = function (
    this: WebGL2RenderingContext,
    shader: WebGLShader,
    source: string,
  ) {
    origShaderSource.call(this, shader, source);
    const typeParam = this.getShaderParameter(shader, this.SHADER_TYPE) as number;
    if (typeParam === this.FRAGMENT_SHADER && source.includes('#version 300 es')) {
      fragmentSourcePending = source;
      // Detect warp vs comp: comp preamble has "gammaAdj" and "fShader", warp doesn't
      if (source.includes('uniform float gammaAdj')) {
        capturePhase = 'comp';
      } else if (source.includes('uniform float decay')) {
        capturePhase = 'warp';
      } else {
        capturePhase = 'other';
      }
    }
  };

  // --- compileShader ---
  const origCompile = proto.compileShader;
  proto.compileShader = function (this: WebGL2RenderingContext, shader: WebGLShader) {
    origCompile.call(this, shader);

    const ok = this.getShaderParameter(shader, this.COMPILE_STATUS) as boolean;
    if (!ok) {
      const log = this.getShaderInfoLog(shader) ?? '(no log)';
      const typeParam = this.getShaderParameter(shader, this.SHADER_TYPE) as number;
      const shaderType =
        typeParam === this.VERTEX_SHADER
          ? 'VERTEX'
          : typeParam === this.FRAGMENT_SHADER
            ? 'FRAGMENT'
            : 'unknown';

      const entry: ShaderFailure = {
        preset: currentPreset,
        stage: 'compile',
        shaderType: shaderType as ShaderFailure['shaderType'],
        error: log,
      };
      failures.push(entry);
      failedPresets.add(currentPreset);

      const src = this.getShaderSource(shader) ?? '(no source)';
      console.error(`[MW-QA] ❌ SHADER COMPILE FAILED: "${currentPreset}" (${shaderType})\n${log}`);
      // Dump lines around the error line number
      const lineMatch = log.match(/0:(\d+):/);
      if (lineMatch) {
        const errLine = parseInt(lineMatch[1], 10);
        const lines = src.split('\n');
        const start = Math.max(0, errLine - 5);
        const end = Math.min(lines.length, errLine + 5);
        const snippet = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1}: ${l}`)
          .join('\n');
        console.log(`[MW-QA] SHADER LINES ${start + 1}-${end}:\n${snippet}`);
      }
    } else {
      // Successful compile — capture source for later dump
      if (fragmentSourcePending && capturePhase !== 'other') {
        if (!shaderSources.has(currentPreset)) {
          shaderSources.set(currentPreset, {});
        }
        const entry = shaderSources.get(currentPreset)!;
        if (capturePhase === 'warp') entry.warpFrag = fragmentSourcePending;
        else if (capturePhase === 'comp') entry.compFrag = fragmentSourcePending;
        fragmentSourcePending = null;
      }
    }
  };

  // --- linkProgram ---
  const origLink = proto.linkProgram;
  proto.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram) {
    origLink.call(this, program);

    const ok = this.getProgramParameter(program, this.LINK_STATUS) as boolean;
    if (!ok) {
      const log = this.getProgramInfoLog(program) ?? '(no log)';

      const entry: ShaderFailure = {
        preset: currentPreset,
        stage: 'link',
        shaderType: 'unknown',
        error: log,
      };
      failures.push(entry);
      failedPresets.add(currentPreset);

      console.error(`[MW-QA] ❌ SHADER LINK FAILED: "${currentPreset}"\n${log}`);
    }
  };

  // Expose to console for easy access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__mwShaderQA = {
    getFailures: getShaderFailures,
    getFailedPresets: () => [...failedPresets],
    clear: () => {
      failures.length = 0;
      failedPresets.clear();
    },
    /** Dump full fragment shader source for a preset. Call with no args for current. */
    dumpShader: (name?: string) => {
      const target = name ?? currentPreset;
      const entry = shaderSources.get(target);
      if (!entry) {
        console.log(`[MW-QA] No shader sources captured for "${target}"`);
        console.log('Available:', [...shaderSources.keys()].join(', '));
        return;
      }
      if (entry.warpFrag) {
        console.log(`[MW-QA] === WARP FRAGMENT for "${target}" ===`);
        console.log(entry.warpFrag);
      }
      if (entry.compFrag) {
        console.log(`[MW-QA] === COMP FRAGMENT for "${target}" ===`);
        console.log(entry.compFrag);
      }
    },
    /** List all presets with captured shaders */
    listCaptured: () => [...shaderSources.keys()],
    /** Compare two presets' shaders side by side (useful for bundled vs imported) */
    compare: (name1: string, name2: string) => {
      const e1 = shaderSources.get(name1);
      const e2 = shaderSources.get(name2);
      if (!e1 || !e2) {
        console.log(`[MW-QA] Need both presets loaded. Available:`, [...shaderSources.keys()]);
        return;
      }
      for (const type of ['warpFrag', 'compFrag'] as const) {
        const s1 = e1[type] ?? '(none)';
        const s2 = e2[type] ?? '(none)';
        if (s1 === s2) {
          console.log(`[MW-QA] ${type}: IDENTICAL`);
        } else {
          console.log(`[MW-QA] ${type}: DIFFERENT`);
          console.log(`--- ${name1} (${s1.length} chars) ---`);
          console.log(s1);
          console.log(`--- ${name2} (${s2.length} chars) ---`);
          console.log(s2);
        }
      }
    },
  };

  console.log(
    '[MW-QA] Shader diagnostics installed. Commands:\n' +
      '  __mwShaderQA.dumpShader()           — dump current preset shader\n' +
      '  __mwShaderQA.dumpShader("name")      — dump specific preset shader\n' +
      '  __mwShaderQA.compare("a", "b")       — compare two presets\n' +
      '  __mwShaderQA.listCaptured()          — list all captured presets\n' +
      '  __mwShaderQA.getFailures()           — get compile/link failures',
  );
}
