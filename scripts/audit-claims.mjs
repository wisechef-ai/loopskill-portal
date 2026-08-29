#!/usr/bin/env node
/**
 * audit-claims.mjs — the publish gate for the portal, made executable.
 *
 * WHY THIS EXISTS
 * ---------------
 * `hub.md` §5 (the claims register) says nothing goes onto a public surface
 * unless it has a row there with a verified date and a probe that proves it.
 * The API repo enforces the ❌ rows on ITS surfaces
 * (`scripts/audit_public_surface.py` in wisechef-ai/loopskill-api). The portal
 * serves a far bigger public surface than the API's three markdown files and
 * had no gate at all — which is how "deploy a bundle to a fleet member",
 * "fast sync" and an ROI metric that D-019 deleted kept finding their way back
 * into copy.
 *
 * WHAT IT SCANS
 * -------------
 * The RENDERED output in dist/, not the .astro sources. A claim is what a
 * visitor reads, and reading the destination rather than the source is the
 * whole lesson of trap E7/R4. Markup is stripped, entities decoded, and the
 * remaining prose split into sentences before the rules run — so a claim
 * broken across three <span>s is still one sentence to this gate.
 *
 * Only mode="public" surfaces carry marketing claims, but we scan every
 * emitted page: a member-only surface that says something false is still
 * false, and the anon/member dual-render means "member-only" is a property of
 * CSS, not of the bytes we ship.
 *
 * RULE PROVENANCE
 * ---------------
 * Rule ids match the API repo's one-for-one on purpose. When a probe upgrades
 * a §5 row to ✅, the rule is DELETED from both — never softened, because a
 * hedge is still a claim.
 *
 * Usage:
 *   node scripts/audit-claims.mjs [dist_dir]
 *
 * Exit 0 = no false claim on any rendered surface. Exit 1 = violations.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The disclosure these rules force people to write is the NEGATION of the
 * claim ("telemetry is NOT automatic", "sync is NOT instant"). A gate that
 * cannot tell the two apart flags exactly the sentence it exists to demand —
 * the API script's first version flagged its own required disclosure.
 */
const DENIAL = /\bnot\b|\bn't\b|\bnever\b|\bno longer\b|\bonly\b|\bwithout\b|\bcannot\b/i;

/**
 * The denial shape for the two push rules specifically: a negator sitting
 * directly on the push verb ("nothing is PUSHED to a fleet", "LoopSkill never
 * DEPLOYS a bundle"). The generic DENIAL above is too loose here — it would
 * exonerate "Deploy a cookbook to every agent, only on Pro" on the strength of
 * the word "only", which negates nothing.
 *
 * The residual hole, stated rather than hidden: a fragment that negates one
 * push and asserts another ("you never push — we deploy the bundle for you")
 * is exonerated. It is contrived, it is pinned in the test file, and closing
 * it would need a parser rather than a matcher.
 */
const NEGATED_PUSH =
  /\b(never|not|nothing|no|cannot|can't|isn't|aren't|doesn't|don't)\b[^.\n]{0,25}?\b(push\w*|deploy\w*|ship(s|ped|ping)?|rolls?\s*out|rolled\s*out)\b/i;

/**
 * DIVERGENCE FROM THE API PORT, on purpose: `audit_public_surface.py` gives
 * each rule at most ONE exoneration (its `unless` / `unless_absent` pair).
 * The portal needs two on the push rules, because the portal is where the
 * honest denial actually has to be written in prose — the API's surfaces can
 * get away with silence, a product page cannot. `exonerations` is a list of
 * {when, unlessAlso}: the rule stays silent if any entry's `when` matches and
 * its `unlessAlso` (if present) does not.
 */
export const RULES = [
  {
    id: 'bundle-deployment',
    // "deploy a bundle" / "bundles you deploy" — either order, close enough
    // together that the two words are genuinely verb-and-object rather than
    // co-occurring in unrelated clauses of a long sentence.
    pattern: /\bdeploy\w*\b[^.\n]{0,30}?\bbundles?\b|\bbundles?\b[^.\n]{0,30}?\bdeploy\w*\b/i,
    claim: 'hub §5 ❌ "Deploy to a fleet member"',
    why:
      'bundle_deployments = 0 and the bundle apply/jobs surface returns a permanent ' +
      "fake {'status': 'applying'} — it has no terminal state and never had one. " +
      'Composite LOOPS do deploy (real placement chain, converge_0208 P4); bundles do not.',
    exonerations: [
      // A composite LOOP genuinely deploys — but a sentence that names a
      // bundle too has not been rescued by saying "loop" somewhere in it.
      { when: /\bloops?\b/i, unlessAlso: /\bbundles?\b|\bcookbooks?\b/i },
      { when: NEGATED_PUSH },
    ],
  },
  {
    id: 'fleet-push',
    // The same ❌ row from the other side: a card or table cell drops its
    // subject ("A curated set you deploy + sync to a whole fleet"), so the
    // bundle noun is not in the fragment at all — the tell is the TARGET.
    // `clients' agents` (possessive, the shape the portal copy actually uses)
    // must match as readily as `client agents`.
    pattern:
      /\b(deploy|push|ship|roll\s*out)\w*\b[^.\n]{0,40}?\b(to|onto|across|into)\b[^.\n]{0,25}?\b(fleets?|members?|clients?['’]?\s+agents?|every agent|all agents?)\b/i,
    claim: 'hub §5 ❌ "Deploy to a fleet member"',
    why:
      'Nothing is pushed. LoopSkill is pull-based (hub §1): the control plane cannot ' +
      'push and cannot execute. An agent converges by polling; for bundles there is no ' +
      'terminal apply state at all.',
    exonerations: [
      { when: /\bloops?\b|\bplacements?\b/i, unlessAlso: /\bbundles?\b|\bcookbooks?\b/i },
      { when: NEGATED_PUSH },
    ],
  },
  {
    id: 'roi-metric',
    pattern: /cost[ _-]per[ _-]accepted|per accepted change|\bcost per change\b/i,
    claim: 'hub §4 D-019 — the ROI metric is HIDDEN, in any form',
    why:
      'D-019 removed cost_per_accepted_change from the API dashboard routes and the ' +
      'portal fleet-map tile (#174, portal #39). It has never been corroborated ' +
      'server-side. Re-surfacing it in any wording re-opens the decision.',
  },
  {
    id: 'fast-sync',
    pattern:
      /\b(fast|instant|instantly|immediate|immediately|real[- ]?time|realtime)\b[^.\n]{0,30}?\bsync\w*\b|\bsync\w*\b[^.\n]{0,30}?\b(is |are )?(instant|instantly|immediate|immediately|real[- ]?time|realtime)\b/i,
    claim: 'hub §5 ⚠️ "Fast sync" — still false',
    why:
      'Convergence is a 30-minute poll. Nothing is pushed and nothing is real-time. ' +
      'State the interval instead of an adjective.',
    exonerations: [{ when: DENIAL }],
  },
  {
    id: 'loops-on-any-host',
    pattern: /\bloops?\b[^.\n]{0,60}?\b(any|every|all)\b[^.\n]{0,25}?\b(agent|host|vendor|client)s?\b/i,
    claim: 'hub §5 — the loop path is Hermes-only',
    why:
      "app/loop_apply.py writes the Hermes scheduler's ~/.hermes/cron/jobs.json and " +
      'nothing else speaks that format; install-loop-apply.sh refuses Codex/Claude/' +
      'OpenCode hosts rather than installing a cron that can never converge. The SKILL ' +
      'path is cross-vendor; the LOOP path is not.',
    exonerations: [{ when: DENIAL }],
  },
  {
    id: 'automatic-telemetry',
    pattern: /\btelemetry\b[^.\n]{0,40}?\bautomatic\w*\b|\bautomatic\w*\b[^.\n]{0,40}?\btelemetry\b/i,
    claim: 'hub §5 — loop telemetry is NOT automatic',
    why:
      "A loop run is recorded only if the loop's own prompt calls " +
      'scripts/loopskill-emit-run.sh. Nothing else observes a fire. That is the ' +
      'structural reason loop_runs sat at 1 for a year.',
    exonerations: [{ when: DENIAL }],
  },
  {
    id: 'defect-routing-unconditional',
    // Portal-specific ❌ row. The feedback rail routes a defect to the
    // operator's private repo ONLY when the report carries provenance; without
    // it the dispatcher falls back to the PUBLIC default repo. Stating the
    // private-repo destination unconditionally promises a confidentiality
    // property the code does not guarantee.
    pattern:
      /\b(defects?|reports?|issues?|bug reports?)\b[^.\n]{0,60}?\b(routes?|lands?|goes|go|arrives?|ends up)\b[^.\n]{0,40}?\bprivate (repo|repository)\b|\bprivate (repo|repository)\b[^.\n]{0,40}?\b(defects?|reports?|issues?)\b/i,
    claim: 'hub §5 ⚠️ "defects route to your private repo" — conditional, not guaranteed',
    why:
      'Private-repo routing depends on the report carrying fleet/bundle provenance. ' +
      'A report without it falls back to the PUBLIC default repo. Say the condition, ' +
      'or say nothing — an unconditional sentence here is a confidentiality promise.',
    exonerations: [
      { when: /\bwhen\b|\bif\b|\bprovided\b|\bas long as\b|\botherwise\b|\bfalls? back\b|\bwithout\b/i },
    ],
  },
  {
    id: 'unlocked-price',
    // hub §4 D-003 fixes the PUBLIC ladder at exactly three rungs: Free,
    // Pro $9.95, and Enterprise-on-demand. D-005 adds that anything above Pro
    // is "a sales conversation, never an automated meter" — so a number above
    // Pro is not merely unapproved copy, it contradicts a locked decision by
    // publishing what is deliberately unpublished.
    //
    // This rule exists because /intent shipped a public page headlined
    // "$100/mo" with an "Operator plan" (a banned legacy tier slug), on a
    // question D-003 had already settled. It was orphaned and unindexed, so no
    // link check and no human review saw it for weeks. Adam, 2026-08-07:
    // "$100 is on demand — remove it from the website, it should stay invite
    // only (manual tier up when someone tells us Pro isn't enough)."
    //
    // Matches any dollar amount carrying a monthly/annual cadence, then
    // exonerates the two the ladder actually publishes. Deliberately NOT
    // limited to $100: the failure mode is "a price nobody approved reached a
    // public surface", and the next one will be a different number.
    pattern: /\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:\/\s*(?:mo|month|yr|year)\b|per\s+(?:month|year|seat|agent|client)\b)/i,
    claim: 'hub §4 D-003/D-005 — the public ladder is Free / Pro $9.95 / Enterprise-on-demand',
    why:
      'Only two prices may appear on a public surface: $0 (Free) and $9.95/mo (Pro). ' +
      'Everything above Pro is on-demand and invite-only by decision, so publishing a ' +
      'number for it pre-empts a sales conversation and creates a third pricing story. ' +
      'If a new price is genuinely approved, add a hub §4 decision row FIRST, then ' +
      'exonerate it here — never soften this pattern.',
    exonerations: [
      // The two published rungs. Tolerant of the space Astro emits between the
      // amount and the cadence ("$9.95 /month"), which is a rendering artifact,
      // not a different price.
      { when: /\$\s?9\.95\s*(?:\/\s*(?:mo|month)|per\s+month)\b/i },
      { when: /\$\s?0(?:\.00)?\s*(?:\/\s*(?:mo|month)|per\s+month)\b/i },
      // Referral EARNINGS are what a user RECEIVES, not what LoopSkill charges,
      // and every figure is derived from the legitimate $9.95 Pro price:
      //   "10 refs × $9.95 × 0.5 = $49.75/mo"   "Pro referral $4.98"
      // Scoped to sentences that either show the arithmetic (×, =) or name the
      // referral programme, because a bare price claim contains neither. Per
      // this file's own doctrine: when the gate flags a TRUE sentence,
      // exonerate NARROWLY — never widen the pattern, or it goes blind to the
      // $20/$100 Pro+ claims sitting one page over.
      {
        // NOTE (2026-08-20): the old `\brefer(?:ral|rer|s)?\b` never actually
        // matched "referrals" or "referrers" — for "referrals" the engine
        // matches "refer" + the "ral" alternative (consuming "referral"),
        // then \b has to hold between the trailing "l" and the plural "s",
        // which is not a word boundary, so the whole alternative backtracks
        // and fails; the "s"-only alternative can't match either because the
        // literal after "refer" is "r", not "s". Net effect: the plural forms
        // this exoneration exists FOR were silently unexonerated — e.g. the
        // exact copy on referrals.astro ("...for each of your first 50
        // referrals, then...") tripped `unlocked-price` and red-built the
        // portal. Enumerate every real inflection explicitly (no catch-all
        // \w* — that would also swallow unrelated words like "reference").
        when: /[×x*]\s*\$|\$[\d.,]+\s*[×x*]|\btotal\s*=|\brefer(?:red|ring|rals?|rers?|s)?\b/i,
        unlessAlso: /\bplans?\b|\btiers?\b|\bper\s+(seat|agent|client)\b|\bsubscription\b/i,
      },
      // A dated CORRECTION must be able to quote the price it is retracting.
      // Without this the gate flags the very disclosure it demands — the same
      // trap the API script's first version hit (see this file's header), and
      // the reason the DENIAL exoneration exists for the push rules.
      //
      // Deliberately requires an explicit retraction word IN THE SENTENCE.
      // "Pro is $20/month" cannot exonerate itself; only
      // "the $20/month figure is superseded" can.
      { when: /\b(out of date|outdated|superseded|no longer|former|previously|correction|was priced|historical|withdrawn|retired|discontinued|then priced)\b/i },
      // six-fixes-c (fix/six-c): the WiseChef cross-sell banner (<CrossSell>,
      // src/components/CrossSell.astro) advertises WISECHEF's OWN managed-
      // service price, $199/month — a THIRD-PARTY product, not a LoopSkill
      // tier. hub §4 D-003/D-005 locks LoopSkill's OWN public ladder (Free /
      // Pro $9.95 / Enterprise-on-demand); it says nothing about a different
      // company's price appearing in a cross-sell unit, and widening this
      // rule to cover LoopSkill's tiers-only wording would defeat the guard's
      // purpose. Scoped tightly to sentences that explicitly name WiseChef —
      // narrower is safer per this file's own doctrine (see the referral
      // exoneration above). Was previously "€199/mo" (a real currency bug,
      // since fixed) which never tripped this dollar-only regex at all — the
      // silent bug is why USD had to be re-verified against this gate now.
      { when: /\bWiseChef\b/ },
    ],
  },
  {
    id: 'bundle-limit-ssot-drift',
    // The SISTER of `unlocked-price`. That rule pins the two published PRICES;
    // this one pins the two published BUNDLE LIMITS, which drift the same way
    // and are the only functional difference between Free and Pro (D-025).
    //
    // pricing.astro hardcodes "2 private bundles" and "50 private bundles" in
    // seven places. That is CORRECT architecture — AGENTS.md bans build-time
    // API fetches (WIS-737: couples the build to API uptime) — but it makes the
    // portal↔server agreement a manual contract with no enforcement. Change
    // `pro.bundle_limit` in the API's config/tiers.yaml and this repo keeps
    // advertising the old cap until a human notices.
    //
    // This rule reads the SERVER SSOT and fails when rendered copy contradicts
    // it, so the two repos cannot silently diverge. It is the same defect class
    // as D-011, where a bundle cap counted the wrong thing in one place and the
    // UI reported a number the API did not enforce.
    //
    // Numbers are injected at scan time by `bundleLimitRule()` below, NOT typed
    // here — a hand-typed limit in the guard would be a third copy of the very
    // number the guard exists to keep singular.
    dynamic: 'bundle-limits',
    claim: 'server SSOT — loopskill-api config/tiers.yaml bundle_limit',
    why:
      'Free and Pro differ ONLY by private-bundle cap (D-025), so a stale number here ' +
      'misprices the entire ladder. Public bundles are unlimited on every tier (D-011) — ' +
      'copy that says a bare "N bundles" without "private" also understates Free. ' +
      'Fix the COPY to match config/tiers.yaml; never edit this rule to match the copy.',
    exonerations: [
      { when: /\b(out of date|outdated|superseded|no longer|former|previously|correction|historical)\b/i },
    ],
  },
];

/** Files whose rendered prose is product copy. Everything the build emits. */
const TEXT_SURFACES = ['.html', '.txt'];

/**
 * Pages excluded from the scan, each with the reason. This list must stay
 * empty-or-tiny: an exclusion is a place a false claim can live forever.
 */
const EXCLUDED = [];

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
};

/**
 * Rendered markup → the prose a visitor actually reads.
 *
 * <script> and <style> bodies go entirely (code is not copy). Block-level tags
 * become newlines so two unrelated paragraphs never fuse into one "sentence";
 * inline tags become nothing so a claim split across <span>s reassembles into
 * the single sentence it is on screen.
 */
export function renderedText(html) {
  let s = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Retracted text is not a claim. <del>/<s> render struck through, so a
  // visitor reads them as withdrawn — and an erratum has to be able to quote
  // the sentence it is withdrawing. This is not a loophole: hiding a live
  // claim behind it means shipping that claim with a line through it.
  s = s.replace(/<(del|s)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Block boundaries → newline (these are visual breaks, so never mid-sentence)
  s = s.replace(
    /<\/?(p|div|section|article|header|footer|nav|main|aside|h[1-6]|li|ul|ol|tr|td|th|table|br|hr|pre|blockquote|dt|dd|figcaption|option|label|form|fieldset|legend|details|summary)\b[^>]*>/gi,
    '\n'
  );
  s = s.replace(/<[^>]+>/g, ''); // remaining inline tags → nothing
  for (const [ent, ch] of Object.entries(ENTITIES)) s = s.split(ent).join(ch);
  s = s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
  // Collapse runs of spaces/tabs but keep the newlines we just inserted.
  s = s.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n');
  return s;
}

/**
 * Split prose into claim-sized fragments. Sentence terminators, newlines, and
 * the markdown/table pipe — a row packs several independent claims onto one
 * line and must not leak context between them.
 */
export function fragments(text) {
  return text
    .split(/(?<=[.!?])\s+|\s*\|\s*|\n/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Port of Rule.fires_on() from audit_public_surface.py, generalized to a list
 * of exonerations (see the RULES comment). A rule fires when its pattern
 * matches and NO exoneration applies.
 */
export function firesOn(rule, fragment) {
  // Dynamic rules carry no literal `pattern` — their matcher is compiled from
  // an external source of truth at scan time (see bundleLimitPattern()).
  if (rule.dynamic === 'bundle-limits') {
    if (!BUNDLE_LIMITS.test) return false; // unavailability is reported in main(), not silently here
    if (!BUNDLE_LIMITS.test(fragment)) return false;
    for (const ex of rule.exonerations || []) {
      if (ex.when.test(fragment)) return false;
    }
    return true;
  }
  if (!rule.pattern.test(fragment)) return false;
  for (const ex of rule.exonerations || []) {
    if (!ex.when.test(fragment)) continue;
    if (ex.unlessAlso && ex.unlessAlso.test(fragment)) continue;
    return false;
  }
  return true;
}

/**
 * Resolve the SERVER bundle-limit SSOT and compile the drift pattern for the
 * `bundle-limit-ssot-drift` rule.
 *
 * Reads loopskill-api's config/tiers.yaml directly rather than restating the
 * numbers, so this guard can never become a third copy of the value it exists
 * to keep singular.
 *
 * FAILS LOUDLY when the SSOT is unreachable. A guard that silently skips is
 * worse than no guard: it reports green while enforcing nothing, which is the
 * exact failure shape (`indexed_count=0, last_error=NULL`) that hid github-oss
 * being dark for weeks. Set LOOPSKILL_API_DIR when the API is not a sibling.
 */
function bundleLimitPattern() {
  // Ordered by specificity. The absolute entries are the SELF-HOSTED RUNNER
  // layout, verified on wisechef-hq 2026-08-10: the portal builds under
  // actions-runner-portal/_work/, which does NOT contain the API repo — the API
  // lives under a SEPARATE runner instance. A relative `../loopskill-api` alone
  // therefore resolves locally but NOT in CI, which would have turned this
  // guard into a permanent red build.
  const candidates = [
    process.env.LOOPSKILL_API_DIR && join(process.env.LOOPSKILL_API_DIR, 'config/tiers.yaml'),
    join('..', 'loopskill-api', 'config', 'tiers.yaml'),
    '/home/wisechef/loopskill-api/config/tiers.yaml',
    '/home/wisechef/actions-runner/_work/loopskill-api/loopskill-api/config/tiers.yaml',
  ].filter(Boolean);

  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    return { unavailable: candidates };
  }

  // Minimal scan — no YAML dep. We want two integers, not a parser.
  const raw = readFileSync(found, 'utf8');
  const limits = {};
  let tier = null;
  for (const line of raw.split('\n')) {
    const t = line.match(/^\s{2}([a-z_]+):\s*$/);
    if (t) tier = t[1];
    const l = line.match(/^\s+bundle_limit:\s*(\d+)/);
    if (l && tier) limits[tier] = Number(l[1]);
  }
  if (typeof limits.free !== 'number' || typeof limits.pro !== 'number') {
    return { unparsed: found };
  }

  // Fire on a private-bundle cap that is NOT one of the two the server serves.
  // Deliberately not limited to the current wrong numbers: the failure mode is
  // "a cap nobody approved reached a public surface", and the next one will be
  // a different integer.
  const ok = new Set([limits.free, limits.pro]);
  return {
    source: found,
    limits,
    test: (fragment) => {
      const re = /(\d[\d,]*)\s*private\s+bundles?/gi;
      let m;
      while ((m = re.exec(fragment)) !== null) {
        if (!ok.has(Number(m[1].replace(/,/g, '')))) return true;
      }
      return false;
    },
  };
}

const BUNDLE_LIMITS = bundleLimitPattern();

export function scanText(text, relPath) {
  const out = [];
  for (const fragment of fragments(text)) {
    for (const rule of RULES) {
      if (firesOn(rule, fragment)) {
        out.push({ path: relPath, rule, text: fragment });
        break; // one violation per fragment — the first rule names the defect
      }
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && TEXT_SURFACES.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function main() {
  const distDir = process.argv[2] || 'dist';
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`audit-claims: ${distDir}/ does not exist — run the build first.`);
    return 1;
  }

  // The bundle-limit rule reads an EXTERNAL source of truth. If that source is
  // unreachable the rule cannot run, and a guard that quietly enforces nothing
  // while printing OK is the failure shape this whole file exists to prevent.
  // Report it as a hard error, never a warning.
  if (BUNDLE_LIMITS.unavailable) {
    console.error(
      'audit-claims: cannot reach the bundle-limit SSOT (loopskill-api config/tiers.yaml).\n' +
        `  looked in: ${BUNDLE_LIMITS.unavailable.join(', ')}\n` +
        '  Set LOOPSKILL_API_DIR=/path/to/loopskill-api, or check out the API repo as a sibling.\n' +
        '  Refusing to report OK while the pricing-drift rule is unenforced.'
    );
    return 1;
  }
  if (BUNDLE_LIMITS.unparsed) {
    console.error(
      `audit-claims: found ${BUNDLE_LIMITS.unparsed} but could not read free/pro bundle_limit from it.\n` +
        '  The SSOT format changed — fix this parser rather than deleting the rule.'
    );
    return 1;
  }

  const violations = [];
  const files = walk(distDir);
  for (const file of files) {
    const rel = relative(distDir, file).split(/[\\/]/).join('/');
    if (EXCLUDED.includes(rel)) continue;
    const raw = readFileSync(file, 'utf8');
    const text = rel.endsWith('.html') ? renderedText(raw) : raw;
    violations.push(...scanText(text, rel));
  }

  if (violations.length === 0) {
    console.log(`audit-claims: OK — ${files.length} rendered surface(s) clean`);
    return 0;
  }

  // Group by (rule, sentence): the same shelf heading rendered on 40 pages is
  // one copy defect, not forty.
  const grouped = new Map();
  for (const v of violations) {
    const key = `${v.rule.id} ${v.text}`;
    if (!grouped.has(key)) grouped.set(key, { rule: v.rule, text: v.text, paths: [] });
    grouped.get(key).paths.push(v.path);
  }

  console.error(
    `audit-claims: ${grouped.size} false claim(s) on ${violations.length} rendered surface(s)\n`
  );
  for (const g of grouped.values()) {
    console.error(`  [${g.rule.id}]  ${g.paths.length} page(s), e.g. ${g.paths.slice(0, 3).join(', ')}`);
    console.error(`      "${g.text}"`);
    console.error(`      violates: ${g.rule.claim}`);
    console.error(`      why:      ${g.rule.why}\n`);
  }
  console.error('Delete the claim. Do not soften it — a hedge is still a claim.');
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
