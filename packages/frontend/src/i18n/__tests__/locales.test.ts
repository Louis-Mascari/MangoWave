import { describe, it, expect } from 'vitest';
import i18n, { supportedLanguages } from '../index.ts';

const NAMESPACES = ['common', 'start', 'settings', 'messages'] as const;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const PLURAL_SAMPLE = Array.from({ length: 1001 }, (_, n) => n);

type Json = { [key: string]: string | Json };

/** Flatten every namespace of a locale into `ns:dotted.path` → string. */
function flatten(locale: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Json, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix.endsWith(':') ? `${prefix}${key}` : `${prefix}.${key}`;
      if (typeof value === 'string') out.set(path, value);
      else walk(value, path);
    }
  };
  for (const ns of NAMESPACES) {
    const bundle = i18n.getResourceBundle(locale, ns) as Json | undefined;
    if (!bundle) throw new Error(`${locale}/${ns}.json is not registered with i18next`);
    walk(bundle, `${ns}:`);
  }
  return out;
}

const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, '');
const placeholders = (text: string) => new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]));

const en = flatten('en');
const enBaseKeys = new Set([...en.keys()].map(baseKey));
/** Keys English defines through plural variants (`key_one` / `key_other`). */
const enPluralKeys = new Set([...en.keys()].filter((k) => PLURAL_SUFFIX.test(k)).map(baseKey));
const otherLocales = Object.keys(supportedLanguages).filter((l) => l !== 'en');

describe('locale files', () => {
  it('covers every supported language', () => {
    expect(otherLocales).toHaveLength(8);
  });

  describe.each(otherLocales)('%s', (locale) => {
    const strings = flatten(locale);

    it('has exactly the English key set (plural variants aside)', () => {
      const baseKeys = new Set([...strings.keys()].map(baseKey));
      const missing = [...enBaseKeys].filter((k) => !baseKeys.has(k));
      const extra = [...baseKeys].filter((k) => !enBaseKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it('differs from English only by plural variants of keys English pluralises', () => {
      const stray = [...strings.keys()].filter(
        (k) => !en.has(k) && !(PLURAL_SUFFIX.test(k) && enPluralKeys.has(baseKey(k))),
      );
      expect(stray).toEqual([]);
    });

    it('defines every plural form the language needs', () => {
      // Sampled over counts the UI can show, not the full CLDR list: Spanish and Portuguese
      // only use `many` for multiples of a million
      const rules = new Intl.PluralRules(locale);
      const categories = [...new Set(PLURAL_SAMPLE.map((n) => rules.select(n)))];
      const missing = [...enPluralKeys].flatMap((key) =>
        categories.filter((c) => !strings.has(`${key}_${c}`)).map((c) => `${key}_${c}`),
      );
      expect(missing).toEqual([]);
    });

    it('keeps every {{placeholder}} from the English string', () => {
      const dropped: string[] = [];
      for (const [key, text] of strings) {
        // A plural form English lacks (e.g. Russian `_few`) is checked against `_other`
        const source = en.get(key) ?? en.get(`${baseKey(key)}_other`);
        if (source === undefined) continue; // reported by the key-set test
        const present = placeholders(text);
        for (const name of placeholders(source)) {
          if (!present.has(name)) dropped.push(`${key}: {{${name}}}`);
        }
      }
      expect(dropped).toEqual([]);
    });
  });
});
