/**
 * atomic-habits 2026-09-06 rank-1 — llms.txt must advertise the $49 Founding SKU.
 *
 * Premise (verified live 07:16 and re-verified 21:03 CEST): the capped-100
 * Founding SKU shipped (#304) and /api/marketing/snapshot surfaces it as a
 * top-level `founding` key (#313), but https://app.loopskill.io/llms.txt had
 * ZERO occurrences of "founding" or "49" — its Pricing paragraph was a
 * hardcoded constant while the same endpoint already fetched the snapshot.
 * Every LLM crawler and agent reading llms.txt could not see the one SKU
 * built to convert.
 *
 * Fix: `foundingPricingLine(founding)` derives the line from the snapshot
 * (same discipline #106 applied to the portal banner). This suite pins the
 * pure function AND the wiring (source-string checks — src/pages/llms.txt.ts
 * is an Astro endpoint, exercised at build time, not importable by vitest;
 * see mesh0408-t1d-llms-txt-groups.test.ts for the convention).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { foundingPricingLine } from '../src/pages/llms.txt';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const LLMS_TS = join(ROOT, 'src', 'pages', 'llms.txt.ts');
const SRC = readFileSync(LLMS_TS, 'utf8');

const LIVE_FOUNDING = {
  display_name: 'Founding Member',
  price_usd: 49,
  one_time: true,
  cap: 100,
  remaining: 100,
  cta: 'Become a Founding Member',
  checkout_path: '/api/checkout/founding',
};

describe('foundingPricingLine — pure unit', () => {
  it('renders the $49 one-time offer from live snapshot shape', () => {
    const line = foundingPricingLine(LIVE_FOUNDING);
    expect(line).toBeTruthy();
    expect(line).toContain('$49');
    expect(line).toContain('one-time');
    expect(line).toContain('Only 100 of 100 founding seats left');
    expect(line).toContain('never billed again');
  });

  it('counts DOWN as seats are claimed (not frozen at cap)', () => {
    expect(foundingPricingLine({ ...LIVE_FOUNDING, remaining: 37 })).toContain(
      'Only 37 of 100 founding seats left',
    );
    expect(foundingPricingLine({ ...LIVE_FOUNDING, remaining: 1 })).toContain(
      'Only 1 of 100 founding seats left',
    );
  });

  it('reads SOLD OUT when the cap is reached — never an offer it cannot back', () => {
    const line = foundingPricingLine({ ...LIVE_FOUNDING, remaining: 0 });
    expect(line).toContain('SOLD OUT');
    expect(line).toContain('100 founding seats claimed');
    expect(line).not.toContain('seats left');
  });

  it('formats non-integer prices to 2 decimals', () => {
    expect(
      foundingPricingLine({ ...LIVE_FOUNDING, price_usd: 49.5 }),
    ).toContain('$49.50');
  });

  it('falls back to the default display name when missing', () => {
    expect(foundingPricingLine({ price_usd: 49, cap: 100, remaining: 100 })).toContain(
      'Founding Member',
    );
  });

  it('emits NOTHING without a usable price — no fabricated SKU', () => {
    expect(foundingPricingLine(undefined)).toBeNull();
    expect(foundingPricingLine(null)).toBeNull();
    expect(foundingPricingLine({})).toBeNull();
    expect(foundingPricingLine({ cap: 100, remaining: 5 })).toBeNull();
  });

  it('omits the seats clause when the API gives no remaining/cap', () => {
    const line = foundingPricingLine({ price_usd: 49 });
    expect(line).toContain('$49');
    expect(line).not.toContain('seats');
  });
});

describe('llms.txt wiring — source-string checks', () => {
  it('the Pricing section renders the derived founding line', () => {
    expect(SRC).toContain('## Pricing');
    expect(SRC).toContain('${foundingLine');
    // The template must not have re-hardcoded a literal $49 (the drift class
    // this fix exists to end — a literal would survive the next price change).
    expect(SRC).not.toMatch(/\$49/);
  });

  it('the line is derived from the snapshot fetch this endpoint already makes', () => {
    expect(SRC).toContain('foundingPricingLine(snapRes.data?.founding)');
  });

  it('the Snapshot interface carries the founding key', () => {
    expect(SRC).toMatch(/founding\?:\s*SnapshotFounding/);
  });
});
