/**
 * Dev-only shader diagnostics for QA.
 *
 * Monkey-patches WebGL2RenderingContext to intercept compileShader / linkProgram
 * and log failures keyed to the current preset name.
 *
 * Usage:
 *   1. Import and call `installShaderDiagnostics()` once (e.g. in App.tsx, dev-only).
 *   2. Call `setDiagnosticPresetName(name)` on every preset change.
 *   3. Blast through presets (autopilot at 2-3s).
 *   4. Call `getShaderFailures()` in the console to get the full report,
 *      or just copy the console output.
 *
 * Remove this file (and its callsites) before merging to main.
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

export function setDiagnosticPresetName(name: string): void {
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
  };

  console.log(
    '[MW-QA] Shader diagnostics installed. Use __mwShaderQA.getFailures() to see results.',
  );
}
