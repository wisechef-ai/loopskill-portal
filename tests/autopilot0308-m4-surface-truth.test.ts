/**
 * Phase M4 (autopilot_0308) — the truth pass, on the surface a stranger reads.
 *
 * hub §5 is the claims register: nothing ships to a landing page, a docs page
 * or llms.txt without a row there carrying a probe and a verified date. This
 * file makes the ❌ rows — the claims that are known FALSE today — impossible
 * to write back in.
 *
 * The ❌ rows this pins, and the live evidence behind each:
 *
 *   "Deploy to a fleet member"  — `bundle_deployments = 0`. The apply/jobs
 *   surface (loopskill-api app/bundle_deployment_routes.py:326,348) returns a
 *   permanent `{"status":"applying"}` with no terminal state and never had one.
 *   Six portal pages sold "client deployment", one of them an entire /docs page
 *   describing the flow step by step behind a "Coming Q2 2026" banner — a date
 *   that was already four months in the past on 2026-08-03. A hedge is still a
 *   claim, and an expired hedge is just a claim.
 *
 *   Referral payouts — `/docs` promised "Monthly payouts, $25 min". There is no
 *   payout mechanism: `app/referral_routes.py` sums `reward_cents` into a
 *   dashboard number, and hub D-013 keeps the payout engine dormant and
 *   unscheduled by design. Accruing a balance is real; paying it monthly is not.
 *
 *   Loop limitations — telemetry exists only when a loop's own prompt calls
 *   `loopskill-emit-run.sh`, and the cron path is Hermes-only. llms.txt is read
 *   verbatim by agents, so it is the surface where omitting them costs most.
 *
 *   D-018 — currency is USD, never EUR.
 *
 * What is NOT pinned here, deliberately: the `Pro+ — $100/mo` upgrade walls in
 * library.astro / AddToCookbookScript.astro. Pro+ genuinely exists at that
 * price, so those are not FALSE — they violate D-003 (three public tiers),
 * which is M2's ladder work and touches live checkout. Recorded in
 * /tmp/ISSUES-m4.md rather than changed unilaterally on the last serial phase.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

/** Pages whose rendered copy a cold reader treats as fact. */
const PUBLIC_COPY = [
  'src/pages/index.astro',
  'src/pages/pricing.astro',
  'src/pages/account.astro',
  'src/pages/fleet-map.astro',
  'src/pages/llms.txt.ts',
  'src/pages/docs/index.astro',
  'src/pages/docs/api-keys.astro',
  'src/pages/docs/cookbooks.astro',
  'src/pages/docs/getting-started.astro',
  'src/pages/docs/mcp.astro',
  'src/pages/docs/sync.astro',
  'src/pages/docs/security.astro',
  'src/pages/docs/new-agent.astro',
  'src/pages/docs/referrals.astro',
  'src/pages/referrals.astro',
  'src/components/CrossSell.astro',
];

describe('❌ hub §5 "Deploy to a fleet member" — bundle_deployments = 0', () => {
  it.each(PUBLIC_COPY)('%s does not sell client deployment', (page) => {
    const src = read(page);
    expect(src).not.toMatch(/client deployment/i);
    expect(src).not.toMatch(/deploy\w*\s+(?:a\s+|the\s+)?bundles?\s+(?:to|onto|into)\s+/i);
    expect(src).not.toMatch(/(?:bundles?|artifacts?|everything)\s+deployed\s+to\s+/i);
    expect(src).not.toMatch(/push(?:es|ing)?\s+(?:a\s+)?(?:pre-built\s+)?(?:skill\s+)?bundles?\s+(?:straight\s+)?(?:in)?to/i);
  });

  it('the /docs/deployment page no longer documents a flow that does not exist', () => {
    const src = read('src/pages/docs/deployment.astro');
    // Kept as a redirect so no inbound link 404s; it must carry no copy.
    expect(src).toContain('RedirectStub');
    expect(src).not.toMatch(/Deploying bundles to client agents/i);
    expect(src).not.toMatch(/Step-by-step deployment/i);
  });

  it('no public page hedges with an expired "Coming Q2 2026" banner', () => {
    for (const page of [...PUBLIC_COPY, 'src/pages/docs/deployment.astro']) {
      expect(read(page)).not.toMatch(/Coming\s+(?:with\s+bundle\s+deployment,\s+)?Q[1-4]\s+2026/i);
    }
  });
});

describe('❌ referral payouts — no payout mechanism exists (D-013)', () => {
  it('/docs does not promise monthly payouts with a minimum', () => {
    for (const page of ['src/pages/docs/index.astro', 'src/pages/docs/referrals.astro']) {
      expect(read(page)).not.toMatch(/monthly payouts/i);
      expect(read(page)).not.toMatch(/\$25 min/i);
    }
  });

  it('the referral surfaces do not advertise Pro+ (D-003: three public tiers)', () => {
    expect(read('src/pages/referrals.astro')).not.toMatch(/Pro and Pro\+ subscriber/i);
  });
});

describe('the loop limitations are stated where loops are sold', () => {
  it('llms.txt tells an agent that scheduled-loop telemetry is not automatic', () => {
    const src = read('src/pages/llms.txt.ts');
    expect(src).toMatch(/loopskill-emit-run\.sh/);
  });

  it('llms.txt tells an agent the scheduled-loop path is Hermes-only', () => {
    const src = read('src/pages/llms.txt.ts');
    expect(src).toMatch(/Hermes[^\n]{0,60}only|only[^\n]{0,60}Hermes/i);
  });
});

describe('D-018 — currency is USD, never EUR', () => {
  it.each(PUBLIC_COPY)('%s carries no euro price', (page) => {
    expect(read(page)).not.toMatch(/€\s?\d/);
  });
});

describe('no claim about a competitor, which no probe can settle', () => {
  it('the landing page does not claim to be the only one', () => {
    const src = read('src/pages/index.astro');
    expect(src).not.toMatch(/no skill marketplace gives you/i);
    expect(src).not.toMatch(/the only (?:registry|marketplace)/i);
  });
});

describe('tier vocabulary — "operator" is banned, say "fleet owner"', () => {
  it.each(PUBLIC_COPY)('%s uses no operator noun in rendered copy', (page) => {
    const src = read(page);
    // The banned thing is the NOUN a reader sees, not the legacy tier SLUG,
    // which is still load-bearing in tier maps and equality checks until the
    // pro_plus migration (D-010) runs. A slug is always followed by `:` (object
    // key) or wrapped in quotes; prose never is.
    expect(src).not.toMatch(/\boperators\b/i);
    expect(src).not.toMatch(/\boperator\b(?!\s*[:'"])/i);
  });
});
