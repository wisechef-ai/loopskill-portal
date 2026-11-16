/**
 * tests/lib/dist-guard.ts — the contract that stops dist-reading guards from
 * silently becoming decorative.
 *
 * THE ROT THIS EXISTS TO KILL (kanban t_44dc1600 / PR #140, then t_648b1f3d)
 * ---------------------------------------------------------------------------
 * This portal is a static Astro SSG. `npm test` (CI's "Unit tests" step) runs
 * BEFORE `npm run build`, so `dist/` does not exist there. Every dist-reading
 * case therefore hides behind some form of "no build → nothing to check"
 * self-skip: `if (!built) return`, `describe.skip`, `it.runIf(built)`,
 * `catch { return [] }`, `if (!exists) continue`.
 *
 * A self-skip is indistinguishable from a passing guard in the normal reporter.
 * Concretely: tests/landing-onramp.test.ts reported SIX built-output cases as
 * green while executing ZERO assertions, because no post-build CI step ever
 * ran the file. Proven with an assertion counter, not inferred — see
 * tests/dist-guard-coverage.test.ts, which is the structural half of the fix
 * (it fails CI if a dist-gated case exists in a file no post-build step runs).
 *
 * THE CONTRACT
 * ------------
 * A file wired into a post-build CI step sets `REQUIRE_<X>_BUILT=1`. Under
 * that env, a missing dist/ — or a missing built page, or an empty built-page
 * list — is a THROWN ERROR, never a return. So:
 *
 *   • in the post-build position, the guard cannot go decorative; re-parenting
 *     the step above `Build` fails loudly instead of quietly doing nothing;
 *   • with no env set (a fresh clone, a dev box, CI's pre-build `npm test`),
 *     the self-skip is preserved, because there the absence of dist/ is a
 *     fact about the machine and not a defect.
 *
 * Collection-time throws are deliberately impossible: nothing in here runs at
 * import time, and `distDescribe()` selects the block flavour rather than
 * throwing, so a file can never fail to COLLECT. Failures land on the specific
 * case, which is what makes a negative control prove anything.
 *
 * NEVER replace any of this with `it.skip` / `test.skipIf`: a skip is exactly
 * the thing that rotted. Require, or delete the case.
 */

import { existsSync } from 'node:fs';

/**
 * Write a GitHub Actions workflow command that arrives in the log under EVERY
 * reporter.
 *
 * Why not console.warn — measured on this repo (vitest 4.1.5, jsdom env, via a
 * throwaway probe file that emitted all nine markers):
 *
 *   • default reporter: console.log / warn / error AND process.stdout / stderr
 *     all reach the step output;
 *   • `--reporter=json`: every console.* line is SUPPRESSED (0 of 7 markers),
 *     while process.stderr.write still reaches fd 2 (2 of 2).
 *
 * CI's post-build steps use the default reporter, so console.warn would show
 * today — but a JSON-reporter run, which is exactly how these guards get audited
 * with an assertion counter, drops it silently. A degradation signal that
 * appears or vanishes depending on a flag is the same failure class as a guard
 * that never runs: a signal nobody can see enforces nothing. stderr is
 * reporter-independent, so annotations go there.
 */
export function ciWarn(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : message + '\n');
}

/** Truthy when the caller has promised the build exists (post-build CI step). */
export function requiresBuilt(envName: string): boolean {
  const v = process.env[envName];
  return v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false';
}

export class DistNotBuiltError extends Error {
  constructor(envName: string, what: string, missing: string[]) {
    super(
      [
        `${what}: expected built output but these paths are absent:`,
        ...missing.map((m) => `   • ${m}`),
        ``,
        `This step runs AFTER \`npm run build\`, so a missing build is a hard failure`,
        `by contract (${envName}=1) — it is never a silent skip. Either:`,
        `  1. the step was re-parented above the Build step in .github/workflows/ci.yml`,
        `     (fix the order), or`,
        `  2. the build stopped emitting this surface, in which case the case it`,
        `     guards is dead and should be deleted WITH the step, not skipped.`,
        `Running locally? Build first: npm run build`,
      ].join('\n'),
    );
    this.name = 'DistNotBuiltError';
  }
}

/**
 * Gate a case (or a case's inner read) on built output existing.
 *
 * @returns true when every path exists, so the caller proceeds.
 *          false ONLY when paths are absent and no REQUIRE_*_BUILT is set —
 *          i.e. the legitimate pre-build self-skip.
 * @throws DistNotBuiltError when paths are absent and the env contract is on.
 */
export function distGate(envName: string, what: string, paths: string | string[]): boolean {
  const list = Array.isArray(paths) ? paths : [paths];
  const missing = list.filter((p) => !existsSync(p));
  if (missing.length === 0) return true;
  if (requiresBuilt(envName)) throw new DistNotBuiltError(envName, what, missing);
  return false;
}

/**
 * Assert built output exists INSIDE a case that has already been chosen to run.
 *
 * `distGate()` answers a question about the MACHINE ("is there a build at
 * all?"), which is why returning false is legitimate there. Once a block has
 * been chosen to RUN, a missing built page is no longer a fact about the
 * machine — it is a defect. Writing `if (!distGate(…)) return` in that position
 * re-creates the exact rot this file exists to kill: the case reports a green
 * after executing ZERO assertions, on a partial build, and would keep doing so
 * if a post-build step ever lost its REQUIRE_*_BUILT env. So this always
 * throws. Use distGate to choose the block; use distAssert inside it.
 */
export function distAssert(what: string, paths: string | string[]): void {
  const list = Array.isArray(paths) ? paths : [paths];
  const missing = list.filter((p) => !existsSync(p));
  if (missing.length === 0) return;
  throw new Error(
    [
      `${what}: this case was chosen to RUN, so the built output it reads must exist. Missing:`,
      ...missing.map((m) => `   • ${m}`),
      ``,
      `A case that runs against a partial build and returns early enforces nothing`,
      `(kanban t_648b1f3d: it reports a green that executed zero assertions). Either`,
      `  1. the build stopped emitting this surface — delete the case along with it, or`,
      `  2. dist was swapped mid-run — never run two vitest passes against one dist.`,
    ].join('\n'),
  );
}

/**
 * Guard against the SECOND vacuous shape: a built-output list that comes back
 * empty, so `test.each([])` / `it.each([])` registers no cases at all and the
 * file goes green while gating nothing. Under the env contract an empty list
 * is a failure; without it, the surrounding self-skip already covers the case.
 */
export function requireBuiltCases(envName: string, what: string, items: readonly unknown[]): void {
  if (items.length > 0) return;
  if (requiresBuilt(envName)) {
    throw new Error(
      `${what}: zero built items to gate on, so the .each() over them registers no cases ` +
        `and the suite is decorative (${envName}=1). Either the build stopped emitting this ` +
        `surface (delete the case with it) or the discovery glob is wrong. Build locally and ` +
        `inspect: npm run build && ls -R dist | less`,
    );
  }
}

/**
 * Choose the describe flavour for a built-output block: always RUN the block
 * when the build exists or the env contract demands it, self-skip only when
 * there is genuinely no build and nobody promised one. Never throws, so a file
 * can never fail to collect.
 */
export function distDescribe(
  envName: string,
  distPaths: string | string[],
): typeof globalThis.describe {
  const list = Array.isArray(distPaths) ? distPaths : [distPaths];
  const present = list.every((p) => existsSync(p));
  return present || requiresBuilt(envName) ? globalThis.describe : globalThis.describe.skip;
}
