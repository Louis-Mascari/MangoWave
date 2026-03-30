/**
 * JS wrapper for the hlslparser WASM module.
 * Exports convertHLSLShader(source, entryName, type) — same async API as hlslparser-js.
 */
import HLSLParserModule from '../dist/hlslparser.mjs';

let modulePromise = null;

function getModule() {
  if (!modulePromise) {
    modulePromise = HLSLParserModule().then((instance) => {
      return instance.cwrap('parseHLSL', 'string', ['string', 'string', 'string']);
    });
  }
  return modulePromise;
}

export async function convertHLSLShader(source, entryName, type) {
  const parseHLSL = await getModule();
  return parseHLSL(source, entryName, type);
}
