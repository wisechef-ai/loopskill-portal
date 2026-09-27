/**
 * coldstart_0927 — llms.txt must publish the REAL registration success status.
 *
 * Evidence: eval run 20260927-df5287dd, codex / self-register-agent. The
 * route POST /api/agents/register answers 201 Created, but llms.txt said
 * "On success you get `200`" (hardcoded in the issuedLine builder). The cold
 * agent validated the response strictly against the documented status,
 * concluded the 201 was "unexpected", and DISCARDED the response body —
 * which carried the api_key shown exactly once (it is stored only as a
 * hash). It then re-registered from scratch, burning 2 of the 3 allowed
 * per-IP daily registrations.
 *
 * Since API 0.9.51, /.well-known/agent.json publishes
 * `registration.success.status` (201) next to `errors`. This suite pins:
 *   - the status is DERIVED from that field, never a local literal;
 *   - a pre-0.9.51 snapshot (no success block) degrades to the honest
 *     "201 or 200 — treat both as success" accept-set, NOT a bare number
 *     that might be wrong (the original defect, restated);
 *   - the source file contains no hardcoded success status.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { coldStartSection } from '../src/pages/llms.txt';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = readFileSync(join(ROOT, 'src', 'pages', 'llms.txt.ts'), 'utf8');

// The pre-0.9.51 shape: everything except registration.success.
const LEGACY_SNAPSHOT = {
  registration: {
    endpoint: 'https://app.loopskill.io/api/agents/register',
    method: 'POST',
    canonical_string: 'loopskill-agent-register:v1:{pubkey}:{timestamp}:{nonce}:{agent_name}',
    errors: {
      '400': ['invalid_pubkey'],
      '429': ['ip_registration_limit'],
    },
    grants: ['search'],
    denies: ['admin'],
    issues: { header: 'x-api-key', key_prefix: 'rec_agent_', tier: 'free', shown_once: true },
  },
  mcp: { endpoint: 'https://app.loopskill.io/api/mcp/http' },
};

// The 0.9.51+ shape: success.status present.
const MODERN_SNAPSHOT = {
  ...LEGACY_SNAPSHOT,
  registration: {
    ...LEGACY_SNAPSHOT.registration,
    success: { status: 201, description: 'Created — the api_key is shown exactly once.' },
  },
};

describe('coldstart_0927 — success status is derived, never hardcoded', () => {
  it('renders the status published by the API (201)', () => {
    const out = coldStartSection(MODERN_SNAPSHOT as never);
    expect(out).toContain('On success you get `201`');
    expect(out).not.toContain('On success you get `200`');
  });

  it('degrades to the honest accept-set when the snapshot predates success.status', () => {
    const out = coldStartSection(LEGACY_SNAPSHOT as never);
    expect(out).toMatch(/On success you get `201` \(or `200`/);
    expect(out).toContain('treat both as success');
    expect(out).toContain('registration.success');
  });

  it('keeps the shown-ONCE warning next to the status line (the cost of a wrong strict check)', () => {
    const out = coldStartSection(MODERN_SNAPSHOT as never);
    expect(out).toContain('shown exactly ONCE');
  });

  it('source file hardcodes no bare success status in the issued line', () => {
    // The defect was a literal `200` in the template (source bytes:
    // "On success you get \`200\` with an \`api_key\`"). Both guards are red
    // on the pre-fix source: the derivation must exist, the literal must not.
    expect(SRC).toContain('reg?.success?.status');
    expect(SRC).not.toContain(
      'On success you get \\`200\\` with an'
    );
  });
});
