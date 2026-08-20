/**
 * mesh0408e2e — the publish gate must refuse any price outside the locked ladder.
 *
 * WHY THIS EXISTS
 * ---------------
 * `hub.md` §4 D-003 fixes the PUBLIC ladder at exactly three rungs: Free,
 * Pro $9.95, Enterprise-on-demand. D-005 adds that anything above Pro is
 * "a sales conversation, never an automated meter".
 *
 * `/intent` shipped a public page headlined "$100/mo" offering an "Operator
 * plan" — a banned legacy tier slug — on a question D-003 had already settled.
 * It was orphaned and unindexed, so no link check and no human review caught
 * it. Adam, 2026-08-07: *"the $100 option is on demand — remove it from the
 * website, it should stay invite only (manual tier up when someone will tell
 * us that pro plan ($9.95) is not enough)"*.
 *
 * Deleting that page fixes the instance. This rule fixes the CLASS: the next
 * unapproved price will be a different number on a different page.
 *
 * THE CONTRACT
 * ------------
 * 1. Any $N with a monthly/annual cadence on a rendered surface FAILS.
 * 2. The two published rungs — $0/mo and $9.95/mo — PASS.
 * 3. The rule is not $100-specific.
 *
 * Point 2 is the control. A rule that fails everything would "catch" the
 * defect while making the gate useless, so the exoneration cases matter as
 * much as the detection ones.
 */
import { describe, it, expect } from 'vitest';
import { RULES } from '../scripts/audit-claims.mjs';

const rule = RULES.find((r) => r.id === 'unlocked-price');
if (!rule) throw new Error('unlocked-price rule missing from audit-claims.mjs');

/** Mirror the gate's own decision: pattern hits AND no exoneration applies. */
function flags(sentence: string): boolean {
  if (!rule.pattern.test(sentence)) return false;
  return !(rule.exonerations ?? []).some((ex) => {
    if (!ex.when.test(sentence)) return false;
    return ex.unlessAlso ? !ex.unlessAlso.test(sentence) : true;
  });
}

describe('audit-claims rule: unlocked-price', () => {
  it('is registered', () => {
    expect(rule).toBeDefined();
    expect(rule.claim).toMatch(/D-003/);
  });

  describe('MUST FLAG — prices outside the locked ladder', () => {
    const violations = [
      'Would you deploy your AI agent stack to 20 small businesses for $100/mo?',
      'Would you pay $100/mo for the Operator plan as described above?',
      'Studio plan — $49/month for unlimited client fleets.',
      'Just $29.99 per month.',
      'Scale tier: $1,200/yr billed annually.',
      'Only $12 per seat.',
      '$5 per agent, per month.',
      'Enterprise starts at $500/mo.',
    ];
    for (const s of violations) {
      it(`flags: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(true);
      });
    }
  });

  describe('MUST NOT FLAG — the two published rungs (the CONTROL)', () => {
    const allowed = [
      'Pro · $9.95/mo',
      'Pro $9.95/mo — 50 private bundles.',
      'Everything on Free, forever. $0/mo.',
      '$0.00/mo — no card required.',
      'Pro is $9.95 per month and includes 50 private bundles.',
      // Astro renders a space between amount and cadence on /pricing.
      'Pro at $9.95 /month for 50 private bundles.',
    ];
    for (const s of allowed) {
      it(`allows: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(false);
      });
    }
  });

  describe('MUST NOT FLAG — prose that merely mentions money', () => {
    const innocuous = [
      'Enterprise pricing is available on demand — talk to us.',
      'We raised $2M in seed funding.',
      'A run costs about $0.003 in tokens.',
      'Above Pro is a sales conversation, not an automated meter.',
    ];
    for (const s of innocuous) {
      it(`allows: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(false);
      });
    }
  });

  describe('MUST NOT FLAG — referral EARNINGS arithmetic (a true sentence)', () => {
    // What a user RECEIVES, derived from the legitimate $9.95 Pro price.
    // Not a price for a LoopSkill tier, so flagging it would be wrong.
    const earnings = [
      '10 refs × $9.95 × 0.5 = $49.75/mo',
      '50 refs × $9.95 × 0.5 = $248.75/mo',
      'pro_refs = 25 × $9.95 × 0.5 = $124.38/mo',
      'total = $124.38/mo recurring',
      'Pro referral $4.98/mo',
    ];
    for (const s of earnings) {
      it(`allows: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(false);
      });
    }
  });

  describe('MUST NOT FLAG — plural/inflected referral forms (regression, issue-61)', () => {
    // `\brefer(?:ral|rer|s)?\b` looked right but never actually matches
    // "referrals" or "referrers": the "ral"/"rer" alternatives leave a
    // trailing letter ("l"/"r") right before the plural "s", and \b does not
    // hold there — it is not a word boundary. That silently un-exonerated
    // the exact copy on referrals.astro ("...for each of your first 50
    // referrals, then $2.99/mo...") and red-built the portal (PR #64).
    const inflections = [
      'You earn $4.98/mo (50%) for each of your first 50 referrals, then $2.99/mo (30%) for every referral after that.',
      'Top referrers earn $9.95/mo in credits.',
      'Anyone who referred you keeps earning $4.98/mo.',
      'We track everyone referring new signups at $4.98/mo.',
      '50% of $9.95/mo (first 50 referrals; 30% — $2.99/mo — after), every month they stay',
    ];
    for (const s of inflections) {
      it(`allows: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(false);
      });
    }
  });

  describe('the earnings exoneration is NARROW — it cannot launder a price', () => {
    // The whole risk of any exoneration is that it becomes a bypass. These
    // pin that a price claim does not escape by sitting near a multiplication.
    it('still flags a plan price even with arithmetic in the sentence', () => {
      expect(flags('The Studio plan is 2 × $49/month for two seats.')).toBe(true);
    });
    it('still flags a tier price with arithmetic', () => {
      expect(flags('Scale tier = $500/mo × 3 regions.')).toBe(true);
    });
    it('still flags per-seat pricing with arithmetic', () => {
      expect(flags('5 seats × $12 per seat.')).toBe(true);
    });
    it('does not exonerate a bare price with no arithmetic at all', () => {
      expect(flags('$100/mo')).toBe(true);
    });
  });

  describe('MUST NOT FLAG — dated corrections quoting the price they retract', () => {
    // A correction has to be able to name the number it is withdrawing, or the
    // gate flags the very disclosure it demands (the trap the API script's
    // first version hit — see audit-claims.mjs header).
    const corrections = [
      'The "$20/month", "$100/month Pro+", and per-cookbook figures below are superseded.',
      'Pro — then $20/month (superseded; Pro is now $9.95/mo).',
      'Pro+ — then $100/month (a tier since withdrawn; above Pro is on-demand only).',
      'The GoHighLevel skill is part of Pro, then priced at $29/month — that figure is superseded.',
      'This post previously advertised $49/month.',
    ];
    for (const s of corrections) {
      it(`allows: ${s.slice(0, 56)}`, () => {
        expect(flags(s)).toBe(false);
      });
    }
  });

  describe('the correction exoneration is NARROW — a live price cannot self-exonerate', () => {
    it('flags a plain price with no retraction word', () => {
      expect(flags('Pro is $20/month.')).toBe(true);
    });
    it('flags a price whose sentence merely sounds historical without retracting', () => {
      expect(flags('Since 2026 our Scale plan has been $250/mo.')).toBe(true);
    });
    it('flags a live price even when a correction appears in a DIFFERENT sentence', () => {
      // Sentence-scoped by design: the gate splits prose into sentences first.
      expect(flags('Pro+ — $100/month.')).toBe(true);
    });
  });

  it('is not $100-specific — the failure mode is any unapproved price', () => {
    // If someone "fixes" a future violation by special-casing 100, this fails.
    expect(flags('$100/mo')).toBe(true);
    expect(flags('$101/mo')).toBe(true);
    expect(flags('$99/mo')).toBe(true);
  });

  it('would have caught the exact sentence that shipped', () => {
    // The real headline from src/pages/intent.astro:14, deleted 2026-08-07.
    expect(
      flags('Would you deploy your AI agent stack to 20 small businesses for $100/mo?'),
    ).toBe(true);
  });
});
