/**
 * qa0208-w3 (dual-accept rename, portal lane): migrate-on-read helper for
 * localStorage keys renamed recipes_* -> loopskill_*.
 *
 * Contract (matches the cookie/env dual-accept pattern used elsewhere in
 * this migration): prefer the new key; if absent, fall back to the legacy
 * key and BACK-FILL the new key so subsequent reads hit the fast path.
 * The legacy key is never deleted here — cleanup is a separate, later PR
 * once nothing reads the old name anymore.
 *
 * Usage:
 *   import { readMigratedKey } from '../lib/localStorageMigration';
 *   const apiKey = readMigratedKey('loopskill_api_key', 'recipes_api_key');
 */
export function readMigratedKey(newKey: string, legacyKey: string): string | null {
  try {
    const fresh = localStorage.getItem(newKey);
    if (fresh != null) return fresh;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy != null) {
      try { localStorage.setItem(newKey, legacy); } catch { /* best-effort backfill */ }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}
