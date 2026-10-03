/**
 * coldstart_1003 — the keyless install funnel in llms.txt must be complete.
 *
 * Evidence: eval run 20261003-f45ceffc, codex / read-llms-txt-qa (attempt 2/3,
 * check_exit=1 on grep #4). The agent followed llms.txt's cold-start funnel
 * FAITHFULLY — read llms.txt, ran the keyless metasearch it teaches, quoted
 * Step 3's keyless REST route (`/api/skills/metasearch/install?install_ref=`)
 * verbatim in its answer — and failed the check because the ONLY keyless
 * curated install route (`GET /api/skills/install?slug=<slug>`, public,
 * verified live) was documented ~60 lines BELOW the funnel, under
 * "Everything else an agent can call". A keyless agent that does exactly what
 * the funnel says ends up with an install story that covers federated skills
 * only and never learns the curated-catalog install route. Sibling evidence:
 * the identical miss failed codex on 20260909-9b9706fe; harnesses that happen
 * to quote the MCP tool name pass — the section was pass-by-paraphrase-luck.
 *
 * This suite pins the fixed shape of the cold-start section:
 *   - Step 2 offers BOTH keyless REST searches (curated + federated), not
 *     just metasearch;
 *   - Step 3 documents ALL THREE install routes — MCP `loopskill_install`,
 *     the curated signed-tarball route `/api/skills/install?slug=`, and the
 *     federated `metasearch/install?install_ref=` — with route selection by
 *     identifier;
 *   - the regression guards keep the hard-won coldstart education that
 *     already lives in this section (401 = "do Step 1", 307 trailing-slash,
 *     preview_only, unresolvable 404).
 *
 * Red on pre-fix source: `git -C .. worktree add /tmp/pre origin/main` +
 * copy this file into that tree's tests/ → the Step-2/Step-3 assertions fail.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { coldStartSection } from '../src/pages/llms.txt';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = readFileSync(join(ROOT, 'src', 'pages', 'llms.txt.ts'), 'utf8');

const MODERN_SNAPSHOT = {
  registration: {
    endpoint: 'https://app.loopskill.io/api/agents/register',
    method: 'POST',
    canonical_string: 'loopskill-agent-register:v1:{pubkey}:{timestamp}:{nonce}:{agent_name}',
    errors: { '400': ['invalid_pubkey'], '429': ['ip_registration_limit'] },
    grants: ['search'],
    denies: ['admin'],
    issues: { header: 'x-api-key', key_prefix: 'rec_agent_', tier: 'free', shown_once: true },
    success: { status: 201, description: 'Created — the api_key is shown exactly once.' },
  },
  mcp: { endpoint: 'https://app.loopskill.io/api/mcp/http' },
};

const OUT = coldStartSection(MODERN_SNAPSHOT as never);

describe('coldstart_1003 — Step 2 names both keyless REST searches', () => {
  it('documents the curated keyless search route inside the funnel', () => {
    expect(OUT).toContain('/api/skills/search?q=<query>');
  });

  it('still documents the federated keyless metasearch route', () => {
    expect(OUT).toContain('/api/skills/metasearch?q=<query>');
  });

  it('marks which routes need the key and which do not', () => {
    expect(OUT).toMatch(/no key/);
    expect(OUT).toMatch(/needs the Step-1 key/);
  });
});

describe('coldstart_1003 — Step 3 documents every real install route', () => {
  it('documents the curated signed-tarball route (the missing one)', () => {
    expect(OUT).toContain('/api/skills/install?slug=<slug>');
    expect(OUT).toContain('checksum_sha256');
  });

  it('documents the federated keyless REST route the funnel always taught', () => {
    expect(OUT).toContain('/api/skills/metasearch/install?install_ref=<install_ref>');
  });

  it('still documents the MCP install tool', () => {
    expect(OUT).toContain('`loopskill_install`');
  });

  it('teaches route selection by identifier', () => {
    expect(OUT).toContain('Which route depends on which identifier');
    expect(OUT).toMatch(/plain `slug`/);
    expect(OUT).toMatch(/source-qualified `install_ref`/);
  });
});

describe('coldstart_1003 — regression guards for existing funnel education', () => {
  it('keeps the 401 = "you have not done Step 1 yet" lesson', () => {
    expect(OUT).toContain('Invalid or missing x-api-key header');
    expect(OUT).toMatch(/not done Step 1|not that you are rejected/);
  });

  it('keeps the 307 trailing-slash MCP note', () => {
    expect(OUT).toContain('307');
    expect(OUT).toMatch(/trailing-slash/);
  });

  it('keeps preview_only and unresolvable-ref honesty', () => {
    expect(OUT).toContain('preview_only');
    expect(OUT).toContain('"reason": "unresolvable"');
  });
});

describe('coldstart_1003 — the "Everything else" section cross-references the funnel', () => {
  it('labels the REST install line as the Step 3 curated route', () => {
    expect(SRC).toContain(
      'Install (curated slug → signed tarball — the Step 3 route for curated skills)'
    );
  });
});
