// Proves the MX gate sees BARE PROSE addresses, not just mailto: attributes —
// and that it survives doing so.
//
// Origin (kanban t_cb262438, 2026-11-16, split from t_86bfeed5): "Email us at
// support@dead.io" written as prose is advertised to a human exactly as loudly
// as an href, but the gate parsed only mailto: and the address escaped the MX
// check entirely. Widening the scan naively red-builds the portal on the
// documentation fixtures the census found in the live 221-surface dist
// (you@example.com in an input placeholder, client@acme.com in a CLI sample),
// so the RFC 2606/6761 + placeholder exemption had to land in the SAME change.
//
// NEGATIVE CONTROL (the parent's standard — a test that never failed is not
// evidence): the extraction/violation tests below were run against the
// pre-change gate and fail there (the old parser returned zero candidates for
// every prose surface). The exemption tests were run against a naive widening
// (extraction WITHOUT the exemption constant) and fail there (fixtures red).
// Evidence is recorded in the PR body, not asserted by this comment alone.
import { describe, it, expect, vi } from 'vitest';

const {
  scanMailRoutes,
  advertisedProseAddresses,
  isExemptMailDomain,
  disableDirectives,
  RESERVED_MAIL_DOMAINS,
  RESERVED_MAIL_DOMAIN_SUFFIXES,
  PLACEHOLDER_MAIL_DOMAINS,
  SUPPRESSIBLE_RULE_IDS,
} = await import('../scripts/audit-claims.mjs');

const resolveMx = vi.fn();
const OK_MX = [{ exchange: 'inbound-smtp.us-east-1.amazonaws.com', priority: 0 }];
const noMx = () => Object.assign(new Error('no data'), { code: 'ENODATA' });
const resolverDown = () => Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });

const scan = (html: string, extra: Record<string, unknown> = {}) =>
  scanMailRoutes(html, 'a.html', { resolveMx, cache: new Map(), ...extra });
// Convention note: follow tests/contact-route.test.ts — `resolveMx.mockReset().mock…()`
// inline per test. `beforeEach(mockReset)` + bare `mockRejectedValue` trips a
// vitest 4.1.5 unhandled-rejection false failure (verified 2026-11-16).

// ── 1. The hole itself: bare prose now faces the MX verdict ───────────────
// Every test in this block FAILS against the pre-change gate (0 candidates).
describe('bare prose addresses are advertised addresses too', () => {
  it('flags "Email us at support@dead.io" — the exact wording from the card', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<p>Email us at support@dead.io</p>');
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
    expect(v[0].text).toContain('support@dead.io');
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('flags an address inside <footer> even with no contact keyword', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<footer><div>billing@dead.io</div></footer>');
    expect(v).toHaveLength(1);
    expect(v[0].text).toContain('billing@dead.io');
  });
  it('flags an address inside <address> (postal blocks are contact blocks)', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<address>LoopSkill GmbH, write to sales@dead.io</address>');
    expect(v).toHaveLength(1);
    expect(v[0].text).toContain('sales@dead.io');
  });
  it('flags a wrapped sentence: keyword line above, address line below', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<p>Contact us.</p>\n<p>support@dead.io</p>');
    expect(v).toHaveLength(1);
    expect(v[0].text).toContain('support@dead.io');
  });
  it('catches entity-obfuscated addresses: support&#64;dead.io', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<p>Email: support&#64;dead.io</p>');
    expect(v).toHaveLength(1);
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('trims the sentence period: "Email support@dead.io." checks dead.io, not dead.io.', async () => {
    resolveMx.mockReset().mockResolvedValue(OK_MX);
    await scan('<p>Email support@dead.io.</p>');
    expect(resolveMx).toHaveBeenCalledTimes(1);
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('same address as mailto AND prose = ONE finding and ONE lookup', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<a href="mailto:hello@dead.io">hello@dead.io</a> — or just email hello@dead.io');
    expect(v).toHaveLength(1);
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });
});

// ── 2. The bounded context: a parser, not a global grep ────────────────────
// These FAIL against the naive variant (global grep over every line).
describe('the context definition stays bounded', () => {
  it('ignores a bare address with no contact context anywhere near it', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<p>The customer, maria@example-corp.io, signed up in March.</p>');
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
  it('never extracts from <script>/<code>/<pre> — code is not copy', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(
      '<div>Contact support anytime:' +
        '<pre>loopskill deliver --to email:ops@dead-cli-domain.example</pre>' +
        '<code>reply-to: coder@dead-cli-domain.example</code>' +
        '<script>var a="admin@dead-cli-domain.example";</script></div>'
    );
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
  it('the real dist landmine: the hashed stylesheet filename with a double @', async () => {
    // Present in the live dist/index.html (2026-11-16): /_astro/index@_@astro.Cc1biyfE.css.
    // A naive bare-address grep parses `_@astro.Cc1biyfE.css` as an address,
    // DNS answers ENOTFOUND, and the portal red-builds on a FILENAME.
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(
      '<link rel="stylesheet" href="/_astro/index@_@astro.Cc1biyfE.css"> <footer>billing@dead.io</footer>'
    );
    // Only the footer address may reach the resolver — never the filename:
    expect(v).toHaveLength(1);
    expect(v[0].text).toContain('billing@dead.io');
    expect(resolveMx).toHaveBeenCalledTimes(1);
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('never extracts from img srcset-style attributes: logo@2x.png is not an address', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<footer><img src="/images/logo@2x.png" alt="LoopSkill"> Questions? Call us.</footer>');
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
  it('welded inline markup cannot fabricate an address (found by the live-dist census)', async () => {
    // The first real-dist run produced `termsprivacysecurityhello@loopskill.io`
    // from <a>Terms</a><a>Privacy</a><a>Security</a>hello@… — blanking tags to
    // '' welds the words into the local part. Blanks insert a space; this
    // reproduces the exact shape and pins the fix.
    resolveMx.mockRejectedValue(noMx());
    const v = await scan(
      '<footer><nav><a>Terms</a><a>Privacy</a><a>Security</a></nav>hello@dead.io</footer>'
    );
    expect(v).toHaveLength(1);
    // Anchored equality — a substring check would let the welded blob
    // `TermsPrivacySecurityhello@dead.io` pass through 'hello@dead.io'.
    expect(v[0].text).toMatch(/^hello@dead\.io\b/);
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('trailing text cannot weld onto the domain either', async () => {
    resolveMx.mockRejectedValue(noMx());
    const v = await scan('<footer>billing@dead.io<span>Support</span></footer>');
    expect(v).toHaveLength(1);
    expect(v[0].text).toMatch(/^billing@dead\.io\b/);
    expect(resolveMx).toHaveBeenCalledWith('dead.io');
  });
  it('never extracts from a placeholder attribute on a line that says Contact', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(
      '<label for="propose-contact">Contact (optional)</label>\n' +
        '<input id="propose-contact" type="text" placeholder="you@nonreserved-fixture.example" />'
    );
    // Not even exempt-listed — the attribute is stripped before matching.
    // ('.example' is deliberately NOT a reserved suffix.)
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
});

// ── 3. The exemption constants (Do #1) — named, tested, consulted pre-DNS ──
// These FAIL against the naive widening (extraction without exemptions).
describe('RFC 2606 / 6761 reserved names and placeholders never reach DNS', () => {
  it('the census fixtures stay green: you@example.com, client@acme.com', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx()); // ANY real lookup would fail the test
    const v = await scan(
      '<footer>Write to you@example.com or forward reports to client@acme.com</footer>'
    );
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled(); // exemption is identity-based, pre-resolver
  });
  it('every card-named reserved domain and suffix is exempt', () => {
    for (const d of ['example.com', 'example.org', 'example.net', 'example.edu', 'localhost']) {
      expect(isExemptMailDomain(d), d).toBe(true);
    }
    for (const d of ['acme.com', 'domain.com', 'yourdomain.com', 'email.com']) {
      expect(isExemptMailDomain(d), d).toBe(true);
    }
    for (const d of ['anything.test', 'host.invalid', 'printer.local', 'srv.localhost']) {
      expect(isExemptMailDomain(d), d).toBe(true);
    }
    // The constants exist as named exports (the card forbids an inline regex).
    expect(RESERVED_MAIL_DOMAINS.has('example.com')).toBe(true);
    expect(RESERVED_MAIL_DOMAIN_SUFFIXES).toEqual(
      expect.arrayContaining(['.test', '.invalid', '.local', '.localhost'])
    );
    expect(PLACEHOLDER_MAIL_DOMAINS.has('acme.com')).toBe(true);
  });
  it('the exemption does NOT leak to lookalikes or real domains', () => {
    for (const d of ['loopskill.io', 'wisechef.ai', 'gmail.com', 'evil-example.com', 'example.com.evil.io', 'acme.com.evil.io', 'foo.nottest', 'notexample.com', 'localhost.evil.io', 'example.io']) {
      expect(isExemptMailDomain(d), d).toBe(false);
    }
  });
  it('a non-exempt domain on an unreachable resolver still FAILS (no exemption dodges DNS)', async () => {
    resolveMx.mockReset().mockRejectedValue(resolverDown());
    const v = await scan('<footer>Email support@real-but-unreachable.io</footer>');
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-unverifiable');
    expect(v[0].text).toContain('ECONNREFUSED');
  });
  it('case and trailing-dot tricks do not smuggle a reserved domain past the check', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<footer>Email Support@Example.COM.</footer>');
    expect(v).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
});

// ── 4. The escape hatch (Do #3) ────────────────────────────────────────────
// NOTE: the card referenced an "existing" audit-claims-disable-next-line
// hatch; it did not exist in the repo (grep-verified 2026-11-16). This is it,
// built to the same semantics, and pinned here.
describe('the disable-next-line hatch is rule-scoped and never silences DNS outages', () => {
  const page = (directive: string) =>
    `<p>\n${directive}\nEmail us at support@dead.io\n</p>`;

  it('suppresses contact-mail-no-mx on the next line, with a reason', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(page('<!-- audit-claims-disable-next-line contact-mail-no-mx reason=docs-fixture -->'));
    expect(v).toEqual([]);
  });
  it('fires anyway WITHOUT the directive (paired assertion — the green above means nothing otherwise)', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<p>\nEmail us at support@dead.io\n</p>');
    expect(v).toHaveLength(1);
  });
  it('fires anyway when the directive names a different rule', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(page('<!-- audit-claims-disable-next-line unlocked-price reason=copy -->'));
    expect(v).toHaveLength(1);
  });
  it('fires anyway when the directive has no reason=', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(page('<!-- audit-claims-disable-next-line contact-mail-no-mx -->'));
    expect(v).toHaveLength(1);
  });
  it('NEVER silences contact-mail-unverifiable — an outage is not a content decision', async () => {
    resolveMx.mockReset().mockRejectedValue(resolverDown());
    const v = await scan(page('<!-- audit-claims-disable-next-line contact-mail-unverifiable reason=trust-me -->'));
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-unverifiable');
    expect(SUPPRESSIBLE_RULE_IDS.has('contact-mail-unverifiable')).toBe(false);
  });
  it('the hatch also covers mailto findings (line numbers are stable across both passes)', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan(
      '<p>\n<!-- audit-claims-disable-next-line contact-mail-no-mx reason=intentional-dead-demo -->\n<a href="mailto:demo@dead.io">demo</a>\n</p>'
    );
    expect(v).toEqual([]);
  });
  it('disableDirectives records line -> rule id', () => {
    const m = disableDirectives('x\n<!-- audit-claims-disable-next-line contact-mail-no-mx reason=r -->\ny');
    expect(m.get(2)).toBe('contact-mail-no-mx');
  });
});

// ── 5. Regressions: the mailto path the parent shipped still works ────────
describe('mailto behaviour is unchanged', () => {
  it('still fails a mailto domain with no MX', async () => {
    resolveMx.mockReset().mockRejectedValue(noMx());
    const v = await scan('<a href="mailto:hello@loopskill-dead.example">x</a>');
    expect(v).toHaveLength(1);
    expect(v[0].rule.id).toBe('contact-mail-no-mx');
  });
  it('still passes a live mailto domain', async () => {
    resolveMx.mockReset().mockResolvedValue(OK_MX);
    const v = await scan('<a href="mailto:hello@loopskill.io">x</a>');
    expect(v).toEqual([]);
  });
});
