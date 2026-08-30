#!/usr/bin/env node
/**
 * audit-curriculum.mjs — repeatable live probe for bootcamp curriculum rot.
 *
 * WHY THIS EXISTS
 * ----------------
 * The bootcamp fallback curricula (src/pages/bootcamp.astro,
 * src/pages/index.astro) hardcode a small list of skill slugs + tiers to use
 * when the live /api/bootcamp endpoint is unreachable at build time. Twice
 * now (2026-08-20, 2026-08-29) that hardcoded list silently rotted: slugs
 * that were live when written 404'd later, and tiers marked 'pro' turned out
 * to not exist anywhere in the live catalog. `tests/bootcamp-fallback-rot-
 * guard.test.ts` only checks *structure* (offline-safe, no network calls in
 * CI) — it cannot catch a NEW slug going dead after this file's last edit.
 *
 * This script closes that gap with a live check you can run on demand (or
 * wire into a scheduled job) that hits the real API and fails loudly.
 *
 * Usage:
 *   node scripts/audit-curriculum.mjs
 *
 * Exit 0 = every pinned slug is live and its tier matches what the fallback
 *          hardcodes. Exit 1 = at least one slug 404s, or the live catalog
 *          reports a tier for a slug the hardcoded fallback disagrees with.
 */

const API_BASE = process.env.PUBLIC_LOOPSKILL_API_BASE || 'https://app.loopskill.io';

// Kept in sync with the hardcoded `steps` arrays in src/pages/bootcamp.astro
// and src/pages/index.astro's `bootcampFallback`. If you change a slug or
// tier there, update it here too — this script is the rot detector, not the
// source of truth.
const PINNED_SLUGS = {
  'super-memory': 'free',
  'hyperspace-matrix': 'free',
  'plan-for-goal': 'free',
  'musk-5-step-algorithm': 'free',
  'test-driven-development': 'free',
  'agent-browser': 'free',
  'nano-banana-pro': 'free',
  'local-tts-kokoro': 'free',
  'manim-video': 'free',
  'multi-agent-discord-coordination': 'free',
  'summarize-cli': 'free',
};

async function probeSlug(slug) {
  const url = `${API_BASE}/api/skills/${slug}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { slug, ok: false, status: res.status, tier: null };
    const data = await res.json();
    return { slug, ok: true, status: res.status, tier: data?.tier ?? null };
  } catch (e) {
    return { slug, ok: false, status: null, tier: null, error: e?.message };
  }
}

async function main() {
  console.log(`audit-curriculum: probing ${Object.keys(PINNED_SLUGS).length} pinned slug(s) against ${API_BASE}\n`);

  const results = await Promise.all(Object.keys(PINNED_SLUGS).map(probeSlug));

  const dead = results.filter((r) => !r.ok);
  const tierMismatch = results.filter(
    (r) => r.ok && (r.tier ?? '').toLowerCase() !== PINNED_SLUGS[r.slug].toLowerCase(),
  );

  for (const r of results) {
    const expected = PINNED_SLUGS[r.slug];
    if (!r.ok) {
      console.error(`  DEAD    ${r.slug}  (status=${r.status ?? 'n/a'}${r.error ? `, ${r.error}` : ''})`);
    } else if ((r.tier ?? '').toLowerCase() !== expected.toLowerCase()) {
      console.error(`  MISMATCH ${r.slug}  live tier='${r.tier}' but fallback hardcodes '${expected}'`);
    } else {
      console.log(`  ok      ${r.slug}  (tier=${r.tier})`);
    }
  }

  console.log();
  if (dead.length === 0 && tierMismatch.length === 0) {
    console.log('PASS: every pinned curriculum slug is live and its tier matches the hardcoded fallback.');
    return 0;
  }
  if (dead.length > 0) {
    console.error(`FAIL: ${dead.length} pinned slug(s) are dead — update the fallback in bootcamp.astro / index.astro.`);
  }
  if (tierMismatch.length > 0) {
    console.error(`FAIL: ${tierMismatch.length} pinned slug(s) have a live tier that disagrees with the hardcoded fallback.`);
  }
  return 1;
}

main().then((code) => process.exit(code));
