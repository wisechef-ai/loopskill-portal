/**
 * ah_1104 — llms.txt Step 1 advertises the one-command enroller, but only
 * when the live /.well-known/agent.json does.
 *
 * API PR #449 added GET /api/agents/enroll.sh and published it as
 * `registration.enroll_script` in agent.json. llms.txt is the human/agent
 * front door to the same cold-start path, so it must surface the shortcut —
 * and must NOT invent it for an API snapshot that predates the field (a
 * pointer to a 404 is the cold-start dead end this section exists to remove).
 */
import { describe, expect, it } from 'vitest';
import { coldStartSection } from '../src/pages/llms.txt';

const USAGE =
  'curl -fsSL https://app.loopskill.io/api/agents/enroll.sh | bash -s -- <agent-name> [contact]';

const BASE = {
  registration: {
    endpoint: 'https://app.loopskill.io/api/agents/register',
    method: 'POST',
    canonical_string: 'loopskill-agent-register:v1:{pubkey}:{timestamp}:{nonce}:{agent_name}',
  },
};

describe('ah_1104 llms.txt enroll.sh shortcut', () => {
  it('renders the one-command enroller from registration.enroll_script', () => {
    const out = coldStartSection({
      registration: {
        ...BASE.registration,
        enroll_script: {
          url: 'https://app.loopskill.io/api/agents/enroll.sh',
          usage: USAGE,
          requires: ['bash', 'curl', 'openssl>=3'],
          stores: '~/.config/loopskill/agent-ed25519.pem and api_key (mode 600); the key is never printed',
        },
      },
    } as any);
    const step1 = out.split('### Step 1')[1].split('### Step 2')[0];
    expect(step1).toContain(USAGE);
    expect(step1).toContain('needs bash, curl, openssl>=3');
    expect(step1).toContain('curl -fsSL https://app.loopskill.io/api/agents/enroll.sh`');
  });

  it('omits the shortcut for an API snapshot without the field', () => {
    const out = coldStartSection(BASE as any);
    expect(out).not.toContain('enroll.sh');
    expect(out).not.toContain('Shortcut');
  });
});
