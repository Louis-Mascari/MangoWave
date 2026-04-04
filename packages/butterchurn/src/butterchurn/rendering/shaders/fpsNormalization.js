/* [MW-PATCH: universal fps normalization for shader constants]
 *
 * Extracted from milkdrop-preset-converter's normalizeFpsConstants().
 * Applied universally in createShader() for both warp and comp shaders,
 * so ALL presets (bundled butterchurn + imported MilkDrop) benefit.
 * The function is idempotent — already-normalized presets pass through unchanged.
 */

/** Ensure a numeric string is a GLSL float literal (has a decimal point).
 *  GLSL ES 3.0 treats `10` as int — `pow(10, float)` is invalid. */
function glslFloat(s) {
  return s.includes('.') ? s : s + '.0';
}

export default function normalizeFpsConstants(glsl) {
  if (!glsl) return glsl;

  // Helper: match a numeric constant in either bare (`0.004`) or
  // hlslparser-wrapped (`float(0.004)`, `vec3 (float(0.004))`) form.
  // MUST be anchored (^...$) — otherwise it matches constants INSIDE complex
  // expressions like `clamp(mult0(...), 0.0, 1.0)`, causing false positives.
  const CONST_RE =
    /^(?:vec[234]\s*\(\s*)?(?:(?:float|_mw_truncf)\s*\(\s*)?(\d*\.?\d+)\s*\)?\s*\)?$/;

  // Process line by line — fps normalization only affects `ret` statements
  const lines = glsl.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!/\bret\b/.test(line)) continue;
    const indent = line.match(/^(\s*)/)[1];
    let stmt = line.trim();
    // Strip inline comments before matching
    stmt = stmt.replace(/\/\/.*$/, '').trim();
    if (!stmt) continue;
    // hlslparser wraps entire statements in (...); — unwrap for matching
    const outerWrap = stmt.match(/^\((.+)\);$/);
    if (outerWrap) stmt = outerWrap[1].trim() + ';';
    // hlslparser also wraps assignment RHS in parens
    const innerWrap = stmt.match(/^(ret(?:\.[xyzw]+)?\s*=\s*)\((.+)\);$/);
    if (innerWrap) stmt = innerWrap[1] + innerWrap[2] + ';';

    // --- Pattern: ret -= CONST; (simple subtraction) ---
    const subMatch = stmt.match(/^ret(?:\.[xyzw]+)?\s*-=\s*(.+?)\s*;$/);
    if (subMatch) {
      const cm = subMatch[1].match(CONST_RE);
      if (cm) {
        const num = parseFloat(cm[1]);
        if (num > 0 && !isNaN(num)) {
          const newExpr = subMatch[1] + ' * _mw_fps_ratio';
          const newStmt = stmt.replace(subMatch[1], newExpr);
          lines[li] = indent + (outerWrap ? '(' + newStmt.replace(/;$/, ');') : newStmt);
          continue;
        }
      }
    }

    // --- Pattern: ret = ret - CONST; (assignment form of subtraction) ---
    const retAssignSubMatch = stmt.match(
      /^ret(?:\.[xyzw]+)?\s*=\s*ret(?:\.[xyzw]+)?\s*-\s*(.+?)\s*;$/,
    );
    if (retAssignSubMatch) {
      const cm = retAssignSubMatch[1].match(CONST_RE);
      if (cm) {
        const num = parseFloat(cm[1]);
        if (num > 0 && !isNaN(num)) {
          const newExpr = retAssignSubMatch[1] + ' * _mw_fps_ratio';
          const newStmt = stmt.replace(retAssignSubMatch[1], newExpr);
          lines[li] = indent + (outerWrap ? '(' + newStmt.replace(/;$/, ');') : newStmt);
          continue;
        }
      }
    }

    // --- Pattern: ret *= CONST; (feedback decay, 0 < F < 1 only) ---
    const mulMatch = stmt.match(/^ret(?:\.[xyzw]+)?\s*\*=\s*(.+?)\s*;$/);
    if (mulMatch) {
      const cm = mulMatch[1].match(CONST_RE);
      if (cm) {
        const num = parseFloat(cm[1]);
        if (num > 0 && num < 1 && !isNaN(num)) {
          const newExpr = 'pow(' + glslFloat(cm[1]) + ', _mw_fps_ratio)';
          const newStmt =
            'ret' + stmt.match(/^ret((?:\.[xyzw]+)?)\s*\*=/)[1] + ' *= ' + newExpr + ';';
          lines[li] = indent + (outerWrap ? '(' + newStmt.replace(/;$/, ');') : newStmt);
          continue;
        }
      }
    }

    // --- Pattern: ret = (ret - CONST) * FACTOR; (compound) ---
    const compoundMatch = stmt.match(/\(\s*ret\s*-\s*(\d*\.?\d+)\s*\)\s*\*\s*(\d*\.?\d+)/);
    if (compoundMatch) {
      const sub = parseFloat(compoundMatch[1]);
      const mul = parseFloat(compoundMatch[2]);
      if (!isNaN(sub) && !isNaN(mul)) {
        let newStmt = stmt;
        if (sub > 0) {
          newStmt = newStmt.replace(
            /(\(\s*ret\s*-\s*)(\d*\.?\d+)(\s*\))/,
            '$1$2 * _mw_fps_ratio$3',
          );
        }
        if (mul > 0 && mul < 1) {
          newStmt = newStmt.replace(
            /(\)\s*\*\s*)(\d*\.?\d+)/,
            (m, pre, val) => pre + 'pow(' + glslFloat(val) + ', _mw_fps_ratio)',
          );
        }
        if (newStmt !== stmt) {
          lines[li] = indent + (outerWrap ? '(' + newStmt.replace(/;$/, ');') : newStmt);
          continue;
        }
      }
    }

    // --- Pattern: ret = A + B*ret; (affine transform in feedback loop) ---
    const sw = stmt.replace(/\.[xyzw]+/g, ''); // strip swizzles for matching
    let affineA = null;
    let affineB = null;
    let affineRhs = null;
    // Form 1: ret = A + B*ret;
    const af1 = sw.match(/^ret\s*=\s*(-?\d*\.?\d+)\s*([+-])\s*(\d*\.?\d+)\s*\*\s*ret\s*;$/);
    if (af1) {
      affineA = parseFloat(af1[2] === '-' ? '-' + af1[1] : af1[1]);
      affineB = parseFloat(af1[3]);
      affineRhs = stmt.match(/=\s*(.+?)\s*;$/)?.[1];
    }
    // Form 2: ret = B*ret + A;
    if (affineA === null) {
      const af2 = sw.match(/^ret\s*=\s*(\d*\.?\d+)\s*\*\s*ret\s*([+-])\s*(\d*\.?\d+)\s*;$/);
      if (af2) {
        affineB = parseFloat(af2[1]);
        affineA = parseFloat(af2[2] === '-' ? '-' + af2[3] : af2[3]);
        affineRhs = stmt.match(/=\s*(.+?)\s*;$/)?.[1];
      }
    }
    // Form 3: ret = ret*B + A;
    if (affineA === null) {
      const af3 = sw.match(/^ret\s*=\s*ret\s*\*\s*(\d*\.?\d+)\s*([+-])\s*(\d*\.?\d+)\s*;$/);
      if (af3) {
        affineB = parseFloat(af3[1]);
        affineA = parseFloat(af3[2] === '-' ? '-' + af3[3] : af3[3]);
        affineRhs = stmt.match(/=\s*(.+?)\s*;$/)?.[1];
      }
    }
    if (
      affineA !== null &&
      affineB !== null &&
      affineRhs &&
      !isNaN(affineA) &&
      !isNaN(affineB) &&
      Math.abs(affineB - 1.0) > 0.001
    ) {
      const newStmt = `ret = mix(ret, ${affineRhs}, _mw_fps_ratio);`;
      lines[li] = indent + (outerWrap ? '(' + newStmt.replace(/;$/, ');') : newStmt);
      continue;
    }
  }

  return lines.join('\n');
}
