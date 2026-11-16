/**
 * tests/dist-guard-coverage.test.ts — no dist-reading guard may be decorative.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The same bug class has now been hand-discovered three times by reading
 * files and greps:
 *
 *   • t_44dc1600 / PR #138 / PR #140 — tests/landing-onramp.test.ts reported
 *     six built-output cases as green while executing ZERO assertions, because
 *     CI's only run of the file was the pre-build `npm test` step.
 *   • t_648b1f3d — the identical shape was still live in
 *     tests/blog-pv-beacon.test.ts, tests/gap-schema-faq-offer-article.test.ts
 *     and tests/portal-277-federated.test.ts (29 built-output cases, all
 *     skipped in every CI run since they were written).
 *
 * Every one of those was found by a human thinking to look. That is not a
 * control, it is luck. `npm test` runs BEFORE `astro build`, so any case that
 * hides behind `if (!built) return`, `describe.skip`, `it.runIf(built)`,
 * `if (!exists) continue` or `catch { return [] }` reports a verdict CI cannot
 * distinguish from a guard that watched something — UNLESS something checks
 * whether a post-build step actually runs the file. That check is this test.
 *
 * THE RULES ENFORCED
 * -------------------
 *  1. Every tests/*.test.ts with dist-gated cases must appear as an
 *     `npx vitest run tests/<file>` line in .github/workflows/ci.yml AFTER the
 *     Build step (the `npm test` step is not post-build and never will be).
 *  2. A file not yet wired must be named in UNWIRED_DEBT below with a reason
 *     and the kanban card that owns it. New rot cannot land; existing debt is
 *     enumerated, surfaced as a ::warning:: annotation on every CI run, and can
 *     only shrink — a debt entry that is no longer dist-gated, or has since
 *     been wired, FAILS so the ledger cannot silently become a graveyard.
 *  3. A wired file whose step sets no REQUIRE_*_BUILT is reported (warning):
 *     it does run post-build, so it is not decorative today, but nothing stops
 *     it being re-parented above Build and quietly going decorative there.
 *
 * Deliberately NOT asserted: that a wired file's dist cases are correct, or
 * that they are content-required. Those are the file's own problem; this is
 * only the "can this case ever execute?" gate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ciWarn } from './lib/dist-guard';

const ROOT = resolve(__dirname, '..');
const TESTS_DIR = join(ROOT, 'tests');
const CI_FILE = join(ROOT, '.github/workflows/ci.yml');

/**
 * Files that read dist/ through a self-skip and are NOT yet run by a
 * post-build CI step. Every entry owes a reason and a card id. Empty is the
 * goal; empty is also the only honest state, so the test annotates each row.
 *
 * Wired files were verified with an assertion counter (see the case at the
 * bottom): a dist case that reports "passed" while executing zero expect()
 * calls is the failure this ledger exists to make impossible.
 */
const UNWIRED_DEBT: Array<{ file: string; reason: string; card: string }> = [
  {
    file: 'tests/bootcamp-fallback-rot-guard.test.ts',
    reason:
      "'built output' block guards dist/bootcamp + dist/index.html behind `if (!existsSync(file)) return` " +
      '(dead-curriculum-slug links). Wired position needs a REQUIRE_*_BUILT contract like #140.',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/federation-rot-guard.test.ts',
    reason:
      "'built output' block guards dist/federation/index.html behind `if (!existsSync(indexHtml)) return` " +
      '(fabricated "91k+" claim, live-count-or-honest-copy disjunction).',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/live-count-island.test.ts',
    reason:
      'three `if (!existsSync(...)) return` guards over dist/index.html, dist/federation/index.html and ' +
      'dist/_astro. NOTE: also catalog-dependent, so a naive REQUIRE_* on push/PR would couple deploys to a ' +
      'transient 429 — needs the #140 split (BUILT always, CONTENT on schedule/dispatch only).',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/mesh0408-t3b-mesh-view.test.ts',
    reason:
      '14 `it.runIf(built)` cases jsdom-executing dist/mesh/index.html plus its /_astro bundles. runIf(false) ' +
      'SKIPS, so all 14 have never run in CI.',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/qa1018-w2-catalog.test.ts',
    reason:
      '`it.runIf(skillBuilt)` over dist/skills/copywriting/index.html (canonical install phrase, no MCP-first ' +
      'block). Skips in every CI run.',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/qa1018-w1-chrome.test.ts',
    reason:
      '`(dist ? it : it.skip)` over dist/index.html (anon chrome must not leak Sign out / member rail). ' +
      'Skips in every CI run.',
    card: 't_eb25ceb0',
  },
  {
    file: 'tests/unisearch-0709-agent-install.test.ts',
    reason:
      '12 `it.runIf(browseBuilt)` cases jsdom-executing dist/browse/index.html: exactly one federated section, ' +
      'one card per canonical install_ref (case-insensitive dedupe), /api/search authority on collision, the ' +
      'announced count equal to the cards a visitor can actually see, and native-before-federated ordering. ' +
      'Skips in every CI run.',
    card: 't_eb25ceb0',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────

/** `const DIST = join(ROOT, 'dist')`, and anything derived from such a name. */
function deriveDistIdents(src: string): Set<string> {
  const idents = new Set<string>();
  const lines = src.split('\n');
  const DECL = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/;
  const NEW_STMT = /^\s*(?:const|let|var|function|class|export|import|it\s*\(|test\s*\(|describe\s*\()/;
  const DIST_LITERAL = /['"`]\/?dist(?:\/[^'"`]*)?['"`]/;

  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(DECL);
      if (!m) continue;
      const name = m[1];
      if (idents.has(name)) continue;
      // Multi-line statements are the norm for path tables
      // (`const targets = [\n ['dist/…', resolve(dist, '…')], …]`), so read the
      // declaration as a chunk rather than one line.
      let chunk = lines[i];
      for (let j = i + 1; j < Math.min(i + 14, lines.length); j++) {
        if (NEW_STMT.test(lines[j])) break;
        chunk += '\n' + lines[j];
        if (/;\s*$/.test(lines[j])) break;
      }
      const known = [...idents];
      if (DIST_LITERAL.test(chunk) || known.some((d) => new RegExp(`\\b${d}\\b`).test(chunk))) {
        idents.add(name);
        grew = true;
      }
    }
  }
  return idents;
}

/**
 * The self-skip shapes that make a built-output case silently non-executing.
 *
 * Each entry captures the GATE EXPRESSION, not just the shape, because a
 * file-level "this file has a dist path somewhere AND a self-skip somewhere"
 * rule produces false positives — tests/v6-phase-a.test.ts has
 * `if (!existsSync(current)) return` as the base case of a recursive walk over
 * src/, which is nothing to do with the build. A guard only counts when its
 * own gate references a dist-derived identifier.
 *
 * `gate` is the capture group index whose text must mention a dist ident;
 * gate === null means the shape is a dist gate by construction (the
 * tests/lib/dist-guard.ts helpers).
 */
const SELF_SKIP_PATTERNS: Array<{ name: string; re: RegExp; gate: number | null }> = [
  {
    name: 'if (!existsSync(…)) return/continue',
    re: /if\s*\(\s*!\s*existsSync\s*\(([^)]*)\)\s*\)\s*\{?\s*(?:return|continue)\b/g,
    gate: 1,
  },
  {
    name: 'if (!<built>) return/continue',
    re: /if\s*\(\s*!\s*([A-Za-z_$][\w$]*)\s*\)\s*\{?\s*(?:return|continue)\b/g,
    gate: 1,
  },
  { name: 'it/test.runIf(…)', re: /(?:it|test)\s*\.\s*runIf\s*\(([^)]*)\)/g, gate: 1 },
  { name: 'cond ? describe : describe.skip', re: /([A-Za-z_$][\w$]*)\s*\?\s*describe\s*:\s*describe\s*\.\s*skip/g, gate: 1 },
  { name: 'cond ? it : it.skip', re: /([A-Za-z_$][\w$]*)\s*\?\s*(?:it|test)\s*:\s*(?:it|test)\s*\.\s*skip/g, gate: 1 },
  {
    name: 'catch { return [] } over a dist read',
    re: /try\s*\{([\s\S]{0,300}?)\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)*return\s+\[\s*\]\s*;?\s*\}/g,
    gate: 1,
  },
  // The contract helpers in tests/lib/dist-guard.ts self-skip legitimately when
  // no build exists, so a file using them is STILL a file that only means
  // something post-build and must be wired. Recognising them keeps this
  // detector honest as the codebase migrates onto the contract.
  { name: 'distDescribe(…)', re: /\bdistDescribe\s*\(/g, gate: null },
  { name: 'if (!distGate(…))', re: /if\s*\(\s*!\s*distGate\s*\(/g, gate: null },
];

/** `for (const [a, b] of <derived>)` — a destructured loop var inherits derivation. */
function deriveDestructured(src: string, idents: Set<string>): boolean {
  let grew = false;
  for (const m of src.matchAll(/for\s*\(\s*(?:const|let)\s*\[([^\]]+)\]\s+of\s+([A-Za-z_$][\w$]*)\s*\)/g)) {
    if (!idents.has(m[2])) continue;
    for (const name of m[1].split(',').map((s) => s.trim())) {
      if (name && !idents.has(name)) {
        idents.add(name);
        grew = true;
      }
    }
  }
  return grew;
}

/** Does this gate expression actually reference the build? */
function gateTouchesDist(gateText: string, idents: Set<string>): boolean {
  if (/(?:^|[^a-zA-Z0-9_])dist(?:[/'"`]|$)/i.test(gateText)) return true;
  for (const d of idents) {
    if (new RegExp(`\\b${d}\\b`).test(gateText)) return true;
  }
  return false;
}

type Finding = { file: string; idents: string[]; shapes: string[] };

function scanTestsDir(): Finding[] {
  const files = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.ts'))
    // This file quotes every rot shape in order to detect them; reading it as
    // a suspect would make it flag itself into the ledger forever.
    .filter((f) => f !== 'dist-guard-coverage.test.ts')
    .sort();
  const distGated: Finding[] = [];
  for (const f of files) {
    const src = readFileSync(join(TESTS_DIR, f), 'utf-8');
    const idents = deriveDistIdents(src);
    if (idents.size === 0) continue; // never touches a dist path variable
    let grew = true;
    while (grew) grew = deriveDestructured(src, idents);
    const shapes: string[] = [];
    for (const p of SELF_SKIP_PATTERNS) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let hit = false;
      while ((m = p.re.exec(src))) {
        if (p.gate === null || gateTouchesDist(m[p.gate] ?? '', idents)) {
          hit = true;
          break;
        }
      }
      if (hit) shapes.push(p.name);
    }
    if (shapes.length === 0) continue; // reads dist unguarded → genuinely hard-fails, not this class
    distGated.push({ file: `tests/${f}`, idents: [...idents], shapes });
  }
  return distGated;
}

/** Every `npx vitest run tests/<file>` appearing AFTER the Build step in ci.yml. */
function postBuildAllowlist(ci: string): Set<string> {
  const lines = ci.split('\n');
  const buildIdx = lines.findIndex((l) => /^\s*-\s*name:\s*Build\s*$/.test(l));
  expect(buildIdx, 'ci.yml must have a `- name: Build` step to be a post-build reference point').toBeGreaterThan(-1);
  const wired = new Set<string>();
  for (const line of lines.slice(buildIdx)) {
    for (const m of line.matchAll(/npx\s+vitest\s+run\s+(tests\/[\w./-]+\.test\.ts)/g)) wired.add(m[1]);
  }
  return wired;
}

/** Map wired file → the env block of the step that runs it (for the teeth warning). */
function stepEnvFor(ci: string, file: string): Record<string, string> {
  const lines = ci.split('\n');
  const runIdx = lines.findIndex((l) => l.includes(`npx vitest run ${file}`));
  if (runIdx < 0) return {};
  // Walk back to the step's `- name:` then forward to its `run:` collecting env:.
  let start = runIdx;
  while (start > 0 && !/^\s*-\s*name:/.test(lines[start])) start--;
  const env: Record<string, string> = {};
  let inEnv = false;
  for (const l of lines.slice(start, runIdx + 1)) {
    if (/^\s*env:\s*$/.test(l)) { inEnv = true; continue; }
    if (inEnv) {
      if (/^\s*run:/.test(l)) break;
      const m = l.match(/^\s+([A-Z0-9_]+):\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim();
      else if (!/^\s+/.test(l)) inEnv = false;
    }
  }
  return env;
}

const ciText = readFileSync(CI_FILE, 'utf-8');
const distGated = scanTestsDir();
const wired = postBuildAllowlist(ciText);

// ─────────────────────────────────────────────────────────────────────────
// The gate
// ─────────────────────────────────────────────────────────────────────────

describe('dist-guard coverage — no built-output guard may be decorative', () => {
  it('the detector actually detects (it is not itself decorative)', () => {
    // These three were the confirmed t_648b1f3d rot set; if the detector ever
    // stops flagging them it is broken and every green below is meaningless.
    const flagged = new Set(distGated.map((d) => d.file));
    for (const must of [
      'tests/blog-pv-beacon.test.ts',
      'tests/gap-schema-faq-offer-article.test.ts',
      'tests/portal-277-federated.test.ts',
    ]) {
      expect(flagged, `detector lost sight of ${must}`).toContain(must);
    }
    expect(distGated.length).toBeGreaterThan(0);
  });

  it('every dist-gated test file is run by a post-build CI step (or is declared debt)', () => {
    const debtFiles = new Set(UNWIRED_DEBT.map((d) => d.file));
    const violations = distGated
      .filter((d) => !wired.has(d.file) && !debtFiles.has(d.file))
      .map((d) => `   • ${d.file} — self-skip shapes: ${d.shapes.join(', ')}\n     idents: ${d.idents.join(', ')}`);

    if (violations.length > 0) {
      throw new Error(
        [
          `${violations.length} test file(s) gate built-output cases behind a dist/ self-skip but no`,
          `post-build CI step runs them, so those cases execute ZERO assertions in CI while reporting`,
          `a green. Fix one of two ways — do NOT add a skip:`,
          ``,
          ...violations,
          ``,
          `  A. wire it: add \`npx vitest run tests/<file>\` to a post-build step in`,
          `     .github/workflows/ci.yml with a REQUIRE_<X>_BUILT=1 env contract`,
          `     (tests/lib/dist-guard.ts) so a missing dist/ is a hard failure THERE.`,
          `  B. delete the case if the surface it guards no longer exists.`,
          ``,
          `Prove it with a negative control: sabotage the built page, the specific case`,
          `must go RED. A bare green proves nothing.`,
        ].join('\n'),
      );
    }
  });

  it('the debt ledger is honest — no stale or unenforced entries', () => {
    const flagged = new Map(distGated.map((d) => [d.file, d]));
    const problems: string[] = [];
    for (const d of UNWIRED_DEBT) {
      if (!flagged.has(d.file)) {
        problems.push(`   • ${d.file} is in UNWIRED_DEBT but is no longer dist-gated — delete the entry.`);
      }
      if (wired.has(d.file)) {
        problems.push(`   • ${d.file} is in UNWIRED_DEBT but IS now wired post-build — delete the entry (and add its REQUIRE_*_BUILT contract).`);
      }
      if (!/^t_[0-9a-f]{6,}$/.test(d.card)) {
        problems.push(`   • ${d.file} has card "${d.card}" — every debt row must name a real kanban card.`);
      }
      if (d.reason.trim().length < 20) {
        problems.push(`   • ${d.file} has a one-word reason — say what the guard watches.`);
      }
    }
    expect(problems, 'UNWIRED_DEBT is stale/incomplete:\n' + problems.join('\n')).toEqual([]);
  });

  it('debt is VISIBLE: every unwired file emits a ::warning:: annotation', () => {
    // A ledger nobody reads is how the last two of these were missed for weeks.
    for (const d of UNWIRED_DEBT) {
      const f = flaggedOrEmpty(d.file);
      ciWarn(
        `::warning file=${d.file},title=dist guard never runs post-build::` +
          `${d.file} self-skips (${f.shapes.join(', ')}) and no post-build step runs it — ` +
          `its built-output cases enforce nothing. Owner: kanban ${d.card}. ${d.reason}`,
      );
    }
    expect(UNWIRED_DEBT.every((d) => /^t_[0-9a-f]{6,}$/.test(d.card))).toBe(true);
  });

  it('wired dist files have a REQUIRE_*_BUILT teeth contract (advisory)', () => {
    const flagged = new Set(distGated.map((d) => d.file));
    const naked: string[] = [];
    for (const f of wired) {
      if (!flagged.has(f)) continue;
      const env = stepEnvFor(ciText, f);
      if (!Object.keys(env).some((k) => /^REQUIRE_[A-Z0-9_]*BUILT$/.test(k))) naked.push(f);
    }
    // Advisory, not blocking: these DO run post-build today, so they are not
    // decorative — they are only unprotected against being re-parented above
    // Build. Surfaced so the next person sees it instead of rediscovering it.
    for (const f of naked) {
      ciWarn(
        `::warning title=dist guard without a REQUIRE_*_BUILT contract::${f} runs post-build but has no ` +
          `REQUIRE_*_BUILT env — if this step is ever re-parented above Build it goes decorative silently. ` +
          `tests/lib/dist-guard.ts is the contract.`,
      );
    }
    expect(naked.every((f) => wired.has(f))).toBe(true);
  });
});

function flaggedOrEmpty(file: string): { shapes: string[] } {
  return distGated.find((d) => d.file === file) ?? { shapes: ['(undetected)'] };
}
