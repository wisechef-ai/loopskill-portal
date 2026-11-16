// Proves the contact route is real, not asserted.
//
// Origin (kanban t_86bfeed5, 2026-11-16): the footer advertised
// hello@loopskill.io and a code comment called it "(MX verified)". The domain
// never had an MX record, so every customer message to it bounced — silently,
// for months, because nobody had ever sent one. DNS was the only witness and
// nobody had asked it. These tests ask it, in CI, forever.
//
// The address is also proven end-to-end outside CI: a real message sent to
// hello@wisechef.ai is stored by wisechef-email-inbound with a readable body
// (POST /api/inbound -> data/received.jsonl, verified 2026-11-16).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// node:dns is stubbed so the decision table is tested deterministically, with
// no network and no dependence on any domain's live delegation.
const { scanMailRoutes, advertisedMailAddresses, defaultResolveMx } = await import(
  '../scripts/audit-claims.mjs'
);

const resolveMx = vi.fn();

const OK_MX = [{ exchange: 'inbound-smtp.us-east-1.amazonaws.com', priority: 0 }];
const noMx = () => Object.assign(new Error('no data'), { code: 'ENODATA' });
const nxDomain = () => Object.assign(new Error('no such name'), { code: 'ENOTFOUND' });
const resolverDown = () => Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });

describe('advertised mail address extraction', () => {
  it('reads addresses out of href markup and bare mailto:', () => {
    const html = '<a href="mailto:hello@wisechef.ai?subject=X">x</a> ping mailto:ops@example.org.';
    expect(advertisedMailAddresses(html)).toEqual(['hello@wisechef.ai', 'ops@example.org']);
  });
  it('percent-decodes addresses', () => {
    expect(advertisedMailAddresses('mailto:hello%40wisechef.ai')).toEqual(['hello@wisechef.ai']);
  });
});

describe('the MX gate actually discriminates', () => {
  it('passes a domain that accepts mail', async () => {
    resolveMx.mockReset().mockResolvedValue(OK_MX);
    expect(await scanMailRoutes('<a href="mailto:hello@wisechef.ai">x</a>', 'a.html', { resolveMx, cache: new Map() })).toEqual([]);
    expect(resolveMx).toHaveBeenCalledWith('wisechef.ai');
  });
  it('FAILS a domain with no MX record — the loopskill.io defect', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scanMailRoutes('<a href="mailto:hello@loopskill.io">x</a>', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
    expect(v[0].text).toContain('no MX for loopskill.io');
  });
  it('FAILS a domain that does not exist', async () => {
    resolveMx.mockReset().mockRejectedValue(nxDomain());
    const v = await scanMailRoutes('mailto:hi@nope-does-not-exist.example', 'a.html', { resolveMx, cache: new Map() });
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
  });
  it('FAILS on an empty MX answer', async () => {
    resolveMx.mockReset().mockResolvedValue([]);
    const v = await scanMailRoutes('mailto:x@zeromx.example', 'a.html', { resolveMx, cache: new Map() });
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
  });
  // RFC 7505 null MX: the shape that `mx.length === 0` cannot see, because
  // dns.resolveMx() answers NON-EMPTY with an empty/'.' exchange. Found by
  // review on 2026-11-16 while verifying this gate; example.com/.org/.net all
  // publish `MX 0 .`, and any domain that "turned mail off" in a DNS UI does.
  // Without these cases the gate passes the one domain that publicly said it
  // accepts no mail — i.e. it fails at the exact job it was written for.
  it('reports a hard violation for a RFC 7505 null MX (empty exchange)', async () => {
    resolveMx.mockReset().mockResolvedValue([{ exchange: '', priority: 0 }]);
    const v = await scanMailRoutes('mailto:hello@loopskill.io', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
    expect(v[0].text).toContain('null MX');
    expect(v[0].text).toContain('loopskill.io');
  });
  it('reports a hard violation for a null MX written as a root exchange "."', async () => {
    resolveMx.mockReset().mockResolvedValue([{ exchange: '.', priority: 0 }]);
    const v = await scanMailRoutes('mailto:hello@loopskill.io', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
  });
  it('fails loud, not pass, when a null MX is mixed with a real one', async () => {
    // Mixed null/real records are invalid configuration. Passing on the
    // strength of the real record is the optimistic read; a contact route must
    // take the pessimistic one.
    resolveMx.mockReset().mockResolvedValue([OK_MX[0], { exchange: '.', priority: 0 }]);
    const v = await scanMailRoutes('mailto:hello@loopskill.io', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
  });
  it('still passes a real MX that merely looks adjacent to a null one', async () => {
    // Guard against the fix over-reaching: 'mail.' is a real host, not a null MX.
    resolveMx.mockReset().mockResolvedValue([{ exchange: 'mail.example.io', priority: 10 }]);
    const v = await scanMailRoutes('mailto:hello@loopskill.io', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toEqual([]);
  });

  it('refuses to report OK when the resolver is unreachable', async () => {
    resolveMx.mockReset().mockRejectedValue(resolverDown());
    const v = await scanMailRoutes('mailto:hello@wisechef.ai', 'a.html', { resolveMx, cache: new Map() });
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-unverifiable');
    // The operator must be told WHICH domain and WHY it could not be verified,
    // otherwise the build fails with nothing actionable in it.
    expect(v[0].text).toContain('wisechef.ai');
    expect(v[0].text).toContain('ECONNREFUSED');
  });
  it('caches per domain so a 500-page build does not do 500 lookups', async () => {
    resolveMx.mockReset().mockResolvedValue(OK_MX);
    const tag = Date.now();
    const page = `<a href="mailto:a@cache${tag}.example">a</a><a href="mailto:b@cache${tag}.example">b</a>`;
    // ONE cache shared by both pages — that is the behaviour under test.
    const sharedCache = new Map();
    await scanMailRoutes(page, 'a.html', { resolveMx, cache: sharedCache });
    await scanMailRoutes(page, 'b.html', { resolveMx, cache: sharedCache });
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });
});

describe('the shipped source advertises only reachable addresses', () => {
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) files.push(full);
    }
  })('src');

  it('never asserts a claim it did not verify', () => {
    // Regression against the exact wording that hid this defect for months:
    // 'Contact is unified on hello@loopskill.io (MX verified)' — written when the
    // domain had no MX record and had never received a single message.
    for (const f of files) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/\(MX verified\)/);
    }
  });

  it('advertises only domains proven to receive mail', () => {
  // Every advertised domain, each proven by an actual DELIVERY rather than by a DNS
  // lookup — the bar the card itself set ("a successful DNS change is not the
  // acceptance criterion, delivery is"). Adding a domain here without a dated proof
  // is how the last one slipped through:
  //   loopskill.io  MX '10 mail.wisechef.ai' -> postfix :25 -> aiosmtpd :8025 ->
  //                 /opt/mail-inbox; first message ever accepted 2026-11-16T13:22:48Z,
  //                 row id=9, body intact. Before that: no MX at all, silent bounce.
  //   wisechef.ai   MX -> Resend inbound -> wisechef-email-inbound :3345, body via
  //                 GET /emails/receiving/{id}; 65+ real messages since 2026-06-15.
  // A domain outside this set fails the build even when it HAS an MX, because an MX
  // only promises that some server answers — not that a human reads the mailbox.
    const PROVEN = new Set(['loopskill.io', 'wisechef.ai']);
    const seen = new Set();
    for (const f of files) {
      for (const addr of advertisedMailAddresses(readFileSync(f, 'utf8'))) {
        const at = addr.lastIndexOf('@');
        if (at > 0) seen.add(addr.slice(at + 1).toLowerCase());
      }
    }
    for (const d of seen) expect(PROVEN.has(d)).toBe(true);
    expect(seen.size).toBeGreaterThan(0); // a green test over zero addresses proves nothing
  });

  it('Footer states real provenance and never repeats the false "(MX verified)" claim', () => {
    const footer = readFileSync('src/components/Footer.astro', 'utf8');
    // The sentence that let the defect survive review was an unverified "verified".
    expect(footer).not.toMatch(/\(MX verified\)/);
    // It must document the route it actually uses, with the dated delivery proof.
    expect(footer).toContain('mailto:hello@loopskill.io');
    expect(footer).toMatch(/2026-11-16T13:22:48Z/);
    expect(footer).toMatch(/\/opt\/mail-inbox/);
  });
});
