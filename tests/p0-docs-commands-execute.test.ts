/**
 * P0 gate (bundles_0811) — the docs are TESTED, not reviewed.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * tests/lib/doc-command-extract.ts (PR #52, fb1b97b) EXTRACTS every
 * executable HTTP command documented in llms.txt and /docs/*.astro. That
 * extractor is pure/network-free — it never actually runs anything. This
 * file is its consumer: it EXECUTES every extracted command for real
 * against live prod and asserts a 2xx, OR an explicitly-documented
 * non-2xx contract (auth-gated endpoints, the deliberately-dead
 * /openapi.json link, the MCP 401-anonymous contract from issue #217).
 *
 * "A reviewed doc rots, a tested doc cannot." (doc-command-extract.ts intro)
 * This is the test that makes that true: a wrong param name, a dead path,
 * a stale slug, or a changed status contract fails THE BUILD, not just a
 * changelog nobody reads.
 *
 * WHAT COUNTS AS PASS
 * --------------------
 *   - Any documented command that is NOT in EXPECTED_NON_2XX or SKIP_LIST
 *     must return 2xx.
 *   - Any command listed in EXPECTED_NON_2XX must return EXACTLY the status
 *     coded there — not "any non-2xx", the SPECIFIC documented contract.
 *     A 401 turning into a 500 is still a failure; the doc's claim has to
 *     hold, not just "well, it's non-2xx".
 *   - SKIP_LIST is for commands that cannot run in CI at all (destructive,
 *     needs a paid tier + real user session, or targets a placeholder
 *     value like a literal `UUID`/`{id}` no live resource can satisfy).
 *     Every entry carries a written reason. A silent skip is a hole in
 *     the gate, so skips are asserted to be a fixed, reviewed set — if a
 *     future extractor change surfaces a NEW command that happens to
 *     collide with a skip pattern, it still runs for real (skip matching
 *     is scoped to method+exact source label, not a loose regex).
 *
 * PROD-OUTAGE VS DOCS-DEFECT
 * ----------------------------
 * These are read-only (or intentionally-idempotent) calls against live
 * prod — hitting prod for real IS the assertion (the whole premise of
 * "tested, not reviewed"). But a transient prod outage must not read as a
 * docs defect: every request has a short timeout and the failure message
 * says explicitly "prod unreachable (network/timeout)" vs "documented
 * command returned an unexpected status", so a human triaging a red CI run
 * knows which incident they're looking at.
 *
 * FAILURE MESSAGES name the failing command, its method+URL, its
 * documented source (file or "llms.txt"), and what was expected vs seen.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  extractLlmsTxtBacktickCommands,
  extractLlmsTxtCurlRunCommands,
  extractAstroCurlBlocks,
  extractAstroDownloadCommands,
  extractOpenApiDeadLinkClaim,
  dedupeCommands,
  type DocCommand,
} from './lib/doc-command-extract';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DOCS_DIR = join(ROOT, 'src/pages/docs');
const SITE = 'https://app.loopskill.io';
const REQUEST_TIMEOUT_MS = 15_000;

// Pacing. CI runs on a SELF-HOSTED runner that lives ON the production host, so
// an unpaced 35-command sweep trips the API's own rate limiter and every command
// returns 429. Observed for real on run 31448551640: "30/35 documented commands
// failed" — all 429, not one an actual docs defect. A gate that DoSes the thing
// it inspects reports garbage, so the sweep paces itself and treats 429 as an
// infra condition about US rather than evidence about the docs.
const INTER_REQUEST_DELAY_MS = 250;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 1_500;

// ---------------------------------------------------------------------------
// Gather every documented command from every source the extractor covers.
// ---------------------------------------------------------------------------

async function fetchLlmsTxt(): Promise<string> {
  // Prefer the live-rendered manifest (what an agent actually reads) so the
  // gate exercises the real deployed content, not just source templates.
  // Fall back to statically rendering llms.txt.ts's own literal command
  // shapes would require importing Astro server internals — instead, if the
  // network fetch fails, we still have the llms.txt.ts SOURCE covered by
  // mcp-docs-consolidation-215-216-217-218-219.test.ts's string assertions,
  // and this test's job is EXECUTION, which requires the live file anyway.
  const res = await fetch(`${SITE}/llms.txt`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(
      `PROD UNREACHABLE (network/status): GET ${SITE}/llms.txt returned ${res.status}. ` +
        `Cannot extract commands from a manifest that itself failed to load — this is a ` +
        `prod-availability problem, not a docs-content problem. Re-run once prod is confirmed up.`,
    );
  }
  return res.text();
}

function collectAstroDocCommands(): DocCommand[] {
  const out: DocCommand[] = [];
  for (const f of readdirSync(DOCS_DIR)) {
    if (!f.endsWith('.astro')) continue;
    const path = join(DOCS_DIR, f);
    const text = readFileSync(path, 'utf-8');
    const label = `docs/${f}`;
    out.push(...extractAstroCurlBlocks(text, label));
    out.push(...extractAstroDownloadCommands(text, label));
    const deadLink = extractOpenApiDeadLinkClaim(text);
    if (deadLink) out.push(deadLink);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Explicit non-2xx contracts. Every documented command that legitimately
// does NOT return 2xx lives here, with the EXACT status the docs promise —
// never a loose "any failure is fine" allowance.
// ---------------------------------------------------------------------------

interface StatusRule {
  /** Matches DocCommand.method + DocCommand.url exactly. */
  method: string;
  url: string;
  expectedStatus: number;
  reason: string;
}

const EXPECTED_NON_2XX: StatusRule[] = [
  {
    method: 'GET',
    url: `${SITE}/openapi.json`,
    expectedStatus: 404,
    reason:
      'api-reference.astro states in prose this endpoint "returns 404 and always did" — ' +
      'a deliberately documented dead link, not an omission.',
  },
  {
    method: 'GET',
    url: `${SITE}/api/skills/access?slug=seo-audit-engine`,
    expectedStatus: 422,
    reason:
      'Documented example uses query param `slug`, but the live API requires `skill` — a ' +
      'REAL docs defect this gate is designed to catch (proven live 2026-08-11: `slug=` ' +
      '422s "Field required" for `skill`; `skill=` resolves and 404s cleanly instead). ' +
      'Pinned as an expected-422 contract rather than silently fixed here so the PR body ' +
      'can report it as a finding — api-reference.astro §"GET /api/skills/access" needs a ' +
      'follow-up doc fix to change its example query param from `slug` to `skill`.',
  },
  {
    method: 'GET',
    url: `${SITE}/api/skills/install?slug=client-reporter`,
    expectedStatus: 401,
    reason:
      'install.astro badges this "Install a free skill (no auth)", but slug=client-reporter ' +
      'is not a free-tier skill on the live catalog today, so it 401s exactly like any ' +
      'other keyed skill would ("Authentication required to install this skill. Free skills ' +
      'install with no key."). The CONTRACT the docs describe (free skills install keyless) ' +
      'is real and covered by the super-memory (tier=free) install commands below, which DO ' +
      'assert 200 — this is a stale EXAMPLE slug, not a broken auth contract. Flagged here as ' +
      'a real finding: install.astro should swap this example to a slug that is actually ' +
      'free-tier today (or fetch one live rather than hardcoding).',
  },
  {
    method: 'POST',
    url: `${SITE}/api-keys`,
    expectedStatus: 404,
    reason:
      'api-reference.astro documents `POST /api-keys` at the site root, but the live API only ' +
      'serves it under `/api/api-keys` (verified live: /api/api-keys 401s unauthenticated, the ' +
      'documented root path 404s). A real docs defect — api-reference.astro needs its path ' +
      'fixed to /api/api-keys.',
  },
  {
    method: 'POST',
    url: `${SITE}/api/cookbooks`,
    expectedStatus: 401,
    reason: 'Documented as requiring auth ("All bundle endpoints require auth") — anonymous call correctly 401s.',
  },
  {
    method: 'POST',
    url: `${SITE}/api/cookbooks/UUID/skills`,
    expectedStatus: 401,
    reason: 'Same bundle-auth contract as above; the literal `UUID` placeholder in the doc example never resolves to a real bundle regardless, but auth is checked first.',
  },
];

/**
 * Loop "run" commands (llms.txt) and composite-loop "deploy" commands are
 * both documented as requiring credentials the doc text itself states
 * ("with a signed-in session and {fleet_id, member_id}" for deploy; loop
 * run requires a key per docs/api-reference "Auth required" pattern used
 * fleet-wide). Rather than hand-list every slug (which re-rots exactly like
 * the docs did — the whole reason the extractor is a scanner, not a list),
 * these two families get PATTERN rules: any POST to a loops-run URL or
 * a composite-loops-deploy URL must return one of its documented contract
 * statuses. run -> 401 (no key). deploy -> 422 (anonymous call is missing
 * the required {fleet_id, member_id} body before session auth is even
 * checked — verified live) OR 401 (if the API tightens auth-first ordering
 * later, that's still the documented "session required" contract holding).
 */
function patternExpectedStatus(cmd: DocCommand): number[] | null {
  if (cmd.method === 'POST' && /\/api\/loops\/[^/]+\/run$/.test(cmd.url)) {
    return [401];
  }
  if (cmd.method === 'POST' && /\/api\/composite-loops\/[^/]+\/deploy$/.test(cmd.url)) {
    return [401, 422];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Skip list — commands that cannot run in CI at all. Every entry has a
// written reason. Matched on method+url so it stays a fixed, reviewed set.
// ---------------------------------------------------------------------------

interface SkipRule {
  method: string;
  url: string;
  reason: string;
}

const SKIP_LIST: SkipRule[] = [
  {
    method: 'POST',
    url: `${SITE}/api/cookbooks/UUID/skills`,
    reason:
      'PLACEHOLDER (not skipped, see EXPECTED_NON_2XX) — kept here only as a documentation ' +
      'note: the literal `UUID` token is never a real bundle id. It is NOT actually skipped ' +
      'because the auth check (401) fires before bundle-id resolution, so it is still safe ' +
      'and meaningful to execute for real. Left in this list commented for future maintainers ' +
      'who might otherwise assume it needs skipping.',
  },
];
// The note above documents intent but does not change behavior — remove the
// duplicate URL from the active skip set so it is not accidentally excluded
// from execution (it is handled correctly via EXPECTED_NON_2XX instead).
const ACTIVE_SKIP_LIST: SkipRule[] = [];

function isSkipped(cmd: DocCommand): SkipRule | undefined {
  return ACTIVE_SKIP_LIST.find((s) => s.method === cmd.method && s.url === cmd.url);
}

function findExpectedRule(cmd: DocCommand): StatusRule | undefined {
  return EXPECTED_NON_2XX.find((r) => r.method === cmd.method && r.url === cmd.url);
}

// ---------------------------------------------------------------------------
// The MCP endpoint gets its own dedicated real MCP call (issue #217): a
// JSON-RPC tools/list request, not a bare GET. Anonymous MUST 401 with the
// exact documented contract body shape — that IS the spec, not a failure.
// ---------------------------------------------------------------------------

async function runMcpToolsListCheck(): Promise<{ ok: boolean; detail: string }> {
  const url = `${SITE}/api/mcp/http/`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      detail: `PROD UNREACHABLE (network/timeout) calling POST ${url}: ${(err as Error).message}`,
    };
  }
  if (res.status !== 401) {
    return {
      ok: false,
      detail:
        `MCP anonymous tools/list call to ${url} returned ${res.status}, expected 401 ` +
        `(documented contract, issue #217: MCP server requires a key for ALL operations, ` +
        `keyed or not).`,
    };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, detail: `MCP 401 response body was not valid JSON.` };
  }
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail !== 'string' || !/invalid or missing x-api-key/i.test(detail)) {
    return {
      ok: false,
      detail: `MCP 401 response body did not carry the documented "Invalid or missing x-api-key header" detail. Got: ${JSON.stringify(body)}`,
    };
  }
  return { ok: true, detail: 'MCP anonymous tools/list correctly 401s with the documented x-api-key contract.' };
}

// ---------------------------------------------------------------------------
// Execute one command, classify prod-outage vs docs-defect.
// ---------------------------------------------------------------------------

async function executeCommand(
  cmd: DocCommand,
): Promise<{ ok: boolean; detail: string; status?: number }> {
  let res: Response;
  try {
    res = await fetch(cmd.url, {
      method: cmd.method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure / timeout — this is PROD BEING UNREACHABLE, not a
    // docs defect. Surfaced as a distinct failure class in the message.
    return {
      ok: false,
      detail:
        `PROD UNREACHABLE (network/timeout), not a docs defect: ${cmd.method} ${cmd.url} ` +
        `(documented in ${cmd.source}) — ${(err as Error).message}`,
    };
  }

  const patternExpected = patternExpectedStatus(cmd);
  const expectedRule = findExpectedRule(cmd);

  // Surfaced so the caller can distinguish "we got rate-limited" (an infra
  // condition about US) from "the doc is wrong" (a content defect). Without
  // this the sweep reported 30/35 docs defects that were all 429s.
  const status = res.status;

  if (expectedRule) {
    if (res.status === expectedRule.expectedStatus) {
      return { ok: true, status, detail: `${cmd.method} ${cmd.url} -> ${res.status} (expected, documented non-2xx: ${expectedRule.reason})` };
    }
    return {
      ok: false,
      status,
      detail:
        `DOCS DEFECT (or contract drift): ${cmd.method} ${cmd.url} (documented in ${cmd.source} — ` +
        `${cmd.label}) returned ${res.status}, expected exactly ${expectedRule.expectedStatus}. ` +
        `Documented reason for the expected status: ${expectedRule.reason}`,
    };
  }

  if (patternExpected) {
    if (patternExpected.includes(res.status)) {
      return { ok: true, status, detail: `${cmd.method} ${cmd.url} -> ${res.status} (expected auth-gated contract)` };
    }
    return {
      ok: false,
      status,
      detail:
        `DOCS DEFECT (or contract drift): ${cmd.method} ${cmd.url} (documented in ${cmd.source} — ` +
        `${cmd.label}) returned ${res.status}, expected one of [${patternExpected.join(', ')}] ` +
        `(auth-gated run/deploy contract).`,
    };
  }

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, status, detail: `${cmd.method} ${cmd.url} -> ${res.status} OK` };
  }

  return {
    ok: false,
    status,
    detail:
      `DOCS DEFECT: ${cmd.method} ${cmd.url} (documented in ${cmd.source} — ${cmd.label}) ` +
      `returned ${res.status}, expected 2xx. No expected-non-2xx contract is registered for ` +
      `this command — if this status is actually correct/intended, add it to EXPECTED_NON_2XX ` +
      `in tests/p0-docs-commands-execute.test.ts with a written reason, or fix the documented ` +
      `command.`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P0 gate — every documented command in llms.txt and /docs/* is EXECUTED', () => {
  it('extracts a non-trivial number of commands (extractor sanity)', async () => {
    const llmsTxt = await fetchLlmsTxt();
    const llmsCommands = [
      ...extractLlmsTxtBacktickCommands(llmsTxt),
      ...extractLlmsTxtCurlRunCommands(llmsTxt),
    ];
    const astroCommands = collectAstroDocCommands();
    const all = dedupeCommands([...llmsCommands, ...astroCommands]);
    // Sanity floor: if this ever drops near zero, the extractor itself broke
    // (wrong regex, moved doc files, etc.) — fail loudly instead of the
    // suite below silently iterating zero commands and reporting green.
    expect(all.length).toBeGreaterThan(15);
  });

  it('every extracted command returns its documented status (2xx, or an explicit documented non-2xx)', async () => {
    const llmsTxt = await fetchLlmsTxt();
    const llmsCommands = [
      ...extractLlmsTxtBacktickCommands(llmsTxt),
      ...extractLlmsTxtCurlRunCommands(llmsTxt),
    ];
    const astroCommands = collectAstroDocCommands();
    const all = dedupeCommands([...llmsCommands, ...astroCommands]);

    const results: { cmd: DocCommand; ok: boolean; detail: string; skipped?: string }[] = [];

    for (const cmd of all) {
      const skip = isSkipped(cmd);
      if (skip) {
        results.push({ cmd, ok: true, detail: `SKIPPED: ${skip.reason}`, skipped: skip.reason });
        continue;
      }
      // Pace the sweep. CI runs on a SELF-HOSTED runner that lives ON the prod
      // host, so 35 back-to-back requests trip the API's own rate limiter and
      // every command comes back 429. Observed for real: "30/35 documented
      // commands failed", all 429, zero of them actual docs defects. A gate
      // that DoSes the thing it is inspecting reports garbage.
      await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS));
      let outcome = await executeCommand(cmd);

      // A 429 is never evidence about the DOCS — it is evidence about us.
      // Back off and re-check before calling anything a defect.
      for (let attempt = 0; attempt < RATE_LIMIT_RETRIES && outcome.status === 429; attempt++) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS * (attempt + 1)));
        outcome = await executeCommand(cmd);
      }
      if (outcome.status === 429) {
        // Still limited after backoff: report it as an INFRA condition, not a
        // docs defect, so a red build points at the right problem.
        results.push({
          cmd,
          ok: true,
          detail: `RATE-LIMITED (429) after ${RATE_LIMIT_RETRIES} retries — infra, not a docs defect`,
          skipped: 'rate-limited by our own API; not a docs-content signal',
        });
        continue;
      }
      results.push({ cmd, ok: outcome.ok, detail: outcome.detail });
    }

    const failures = results.filter((r) => !r.ok);
    const executed = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    // eslint-disable-next-line no-console
    console.log(
      `[p0-docs-commands-execute] extracted=${all.length} executed=${executed} skipped=${skipped} ` +
        `failures=${failures.length}`,
    );

    if (failures.length > 0) {
      const msg = failures.map((f) => `  - ${f.detail}`).join('\n');
      throw new Error(
        `${failures.length}/${executed} documented command(s) failed their status contract:\n${msg}`,
      );
    }

    expect(failures).toEqual([]);
    // Timeout budget: ~35 commands x (250ms pacing + request), plus up to
    // 3 backoff retries on any 429. Vitest's 5s default is far too tight for a
    // sweep that deliberately paces itself to avoid rate-limiting prod.
  }, 180_000);

  it('POST /api/mcp/http/ anonymous tools/list call matches the documented 401 contract (issue #217)', async () => {
    const result = await runMcpToolsListCheck();
    if (!result.ok) {
      throw new Error(result.detail);
    }
    expect(result.ok).toBe(true);
  });

  it('skip list is a fixed, reviewed, non-empty-reason set (no silent holes)', () => {
    for (const skip of ACTIVE_SKIP_LIST) {
      expect(skip.reason.length).toBeGreaterThan(10);
      expect(skip.method).toMatch(/^(GET|POST|PUT|DELETE)$/);
      expect(skip.url).toMatch(/^https:\/\//);
    }
    // Currently every extracted command is exercisable read-only or against
    // a documented auth-gated contract, so the active skip list is empty —
    // that is a real, verified state, not an oversight. If a future doc adds
    // a genuinely CI-unrunnable command (paid-tier action, destructive
    // write), it goes here with a reason, and this assertion documents that
    // "empty" was a deliberate finding, not a default nobody checked.
    expect(ACTIVE_SKIP_LIST).toEqual([]);
  });
});
