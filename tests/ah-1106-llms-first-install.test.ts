/**
 * ah_1106 — llms.txt Step 3 names the keyless first install, but only when the
 * live /.well-known/agent.json does (API #451: registration.enroll_script.next_step).
 *
 * Live 11-06: an agent that enrolled got a key and no next step, and the working
 * keyless bundle installer was named nowhere on the cold-start path.
 */
import { describe, expect, it } from 'vitest';
import { coldStartSection } from '../src/pages/llms.txt';

const CMD =
  'curl -fsSL https://app.loopskill.io/api/bundles/install.sh | bash -s -- dev-agent-essentials';

const REG = {
  endpoint: 'https://app.loopskill.io/api/agents/register',
  method: 'POST',
  canonical_string: 'loopskill-agent-register:v1:{pubkey}:{timestamp}:{nonce}:{agent_name}',
};

describe('ah_1106 llms.txt first install', () => {
  it('renders the first-install line in Step 3 from enroll_script.next_step', () => {
    const out = coldStartSection({
      registration: {
        ...REG,
        enroll_script: {
          url: 'https://app.loopskill.io/api/agents/enroll.sh',
          usage: 'curl -fsSL https://app.loopskill.io/api/agents/enroll.sh | bash -s -- <agent-name> [contact]',
          next_step: { bundle: 'dev-agent-essentials', command: CMD, requires_key: false },
        },
      },
    } as any);
    const step3 = out.split('### Step 3')[1];
    expect(step3).toContain(CMD);
    expect(step3).toContain('`dev-agent-essentials` starter bundle');
    expect(step3).toContain('/api/bundles/discover');
    expect(out.split('### Step 3')[0]).not.toContain(CMD);
  });

  it('omits the line for an API snapshot without next_step', () => {
    const out = coldStartSection({
      registration: { ...REG, enroll_script: { usage: 'x', url: 'y' } },
    } as any);
    expect(out).not.toContain('bundles/install.sh');
    expect(out).not.toContain('Fastest first install');
  });
});
