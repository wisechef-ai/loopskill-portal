/**
 * portal#125 — the publish gate must refuse "ed25519 verified at install".
 *
 * The API verifies a publisher's ed25519 signature at UPLOAD only. The install
 * response is an expiring HMAC-signed URL + checksum_sha256. These tests pin the
 * rule against the exact sentences that were live on /security, /docs/security,
 * /docs/mcp and the blog (MUST FLAG), and against the honest rewrites (MUST PASS)
 * — a rule that fails everything would "catch" the defect and make the gate useless.
 */
import { describe, it, expect } from 'vitest';
import { RULES, firesOn } from '../scripts/audit-claims.mjs';

const rule = RULES.find((r) => r.id === 'install-time-signature');
if (!rule) throw new Error('install-time-signature rule missing from audit-claims.mjs');

describe('audit-claims rule: install-time-signature', () => {
  it('is registered and cites the issue', () => {
    expect(rule.claim).toMatch(/#125/);
  });

  describe('MUST FLAG — the claims that shipped', () => {
    const violations = [
      'ed25519 signed at publish, verified cryptographically at install',
      'The meta-skill verifies the signature before writing any file to disk.',
      'At install it checks the signature.',
      'An ed25519 signature over the manifest JSON (signed with the LoopSkill publish key)',
      'approved tarballs are signed with the LoopSkill publish key and stored in the CDN',
      'Every skill tarball is signed at publish time and verified on install.',
      'The install command verifies the signature before any disk write.',
      'The Recipes CLI verifies the ed25519 signature on install.',
      'The LoopSkill signing public key is published at /api/signing-key and pinned in the meta-skill.',
      'Signs with the LoopSkill ed25519 publish key',
    ];
    for (const v of violations) {
      it(`flags: ${v.slice(0, 70)}`, () => {
        expect(firesOn(rule, v)).toBe(true);
      });
    }
  });

  describe('MUST PASS — the honest copy', () => {
    const clean = [
      "The API verifies the publisher's ed25519 signature at upload, before anything is stored.",
      'At install, compare checksum_sha256 with the sha256 of the bytes you downloaded.',
      'No ed25519 signature or public key is served to installers, and installers do not verify one.',
      'The signature itself is not served to installers.',
      'Signs the tarball sha256 (ed25519); the API verifies the signature at upload',
      'An agent proves possession of an Ed25519 key and registers itself.',
      'Every install returns an expiring signed download URL and a sha256 checksum.',
      'The trust model checks a publisher ed25519 signature at upload and a sha256 checksum at install.',
      'A publisher ed25519 signature is verified by the API at upload, and every install returns the SHA-256 to compare against.',
      'It generates an ephemeral ed25519 keypair and calls the publish route with the platform signing key.',
    ];
    for (const c of clean) {
      it(`passes: ${c.slice(0, 70)}`, () => {
        expect(firesOn(rule, c)).toBe(false);
      });
    }
  });
});
