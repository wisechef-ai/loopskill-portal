/**
 * docs-drift-wave — items 1-13 + bonus of the 2026-08-21 docs-drift audit
 * (vault: projects/loopskill/research/2026-08-21-docs-drift-fixlist.md).
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The fixlist is a FIX-or-RETRACT wave across docs/*.astro pages, a handful
 * of non-docs pages (security/privacy/integrations/skills/external/
 * dashboard-forks), and 4+1 blog posts. Source-string assertions lock every
 * item at the text level so a future edit that reintroduces a broken/dead
 * command, a stale tier token, or a missing correction banner fails CI
 * instead of shipping — same convention as
 * mcp-docs-consolidation-215-216-217-218-219.test.ts and
 * ah0720-battle-tested-trust-line.test.ts.
 *
 * Live-command verification (items 5-8, the CI doc-execution gate) is
 * covered by tests/p0-docs-commands-execute.test.ts, which this wave also
 * updated (EXPECTED_NON_2XX pins) — see that file's diff for the evidence
 * comments on each changed pin.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const p = (...parts: string[]) => join(ROOT, ...parts);

function readSrc(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

// ---------------------------------------------------------------------------
// Item 1 — docs/api-keys.astro pre/code block is well-formed (regex checks
// every opened <pre><code> has a literal matching </code></pre> closer, the
// exact structural gap the fixlist's follow-up lint recommendation calls for).
// ---------------------------------------------------------------------------
describe('Item 1 — api-keys.astro pre/code blocks are well-formed', () => {
  const API_KEYS = p('src/pages/docs/api-keys.astro');
  const src = readSrc(API_KEYS);

  it('file exists', () => {
    expect(existsSync(API_KEYS)).toBe(true);
  });

  it('every <pre...><code...> has a matching literal </code></pre> closer', () => {
    const opens = [...src.matchAll(/<pre[^>]*><code[^>]*>/g)].length;
    const closes = [...src.matchAll(/<\/code><\/pre>/g)].length;
    expect(opens).toBeGreaterThan(0);
    expect(closes).toBe(opens);
  });

  it('the x-api-key curl example does not swallow the closing tag into a placeholder', () => {
    // The original defect: `-H "x-api-key: ***` had no closing quote/tag —
    // the literal string "pre>" leaked into visible body text because
    // </code></pre> was consumed by the truncated placeholder.
    expect(src).not.toMatch(/x-api-key:\s*\*{3}\s*\n[^<]*pre>/);
  });
});

// ---------------------------------------------------------------------------
// Items 2 & 3 — mkdir -p before the meta-skill curl download, on index.astro
// and deployment.astro (matching install.astro's already-correct form).
// ---------------------------------------------------------------------------
describe('Items 2 & 3 — mkdir -p precedes the meta-skill curl download', () => {
  const targets: [string, string][] = [
    ['index.astro', p('src/pages/docs/index.astro')],
    ['deployment.astro', p('src/pages/docs/deployment.astro')],
  ];

  for (const [name, path] of targets) {
    const src = readSrc(path);

    it(`${name}: mkdir -p ~/.claude/skills/loopskill appears before the curl -o download`, () => {
      expect(src).toMatch(/mkdir -p ~\/\.claude\/skills\/loopskill[\s\S]{0,80}curl[\s\S]{0,120}-o ~\/\.claude\/skills\/loopskill\/SKILL\.md/);
    });
  }
});

// ---------------------------------------------------------------------------
// Item 4 — `loopskill sync` CLI-form retracted; replaced with the MCP tool
// name loopskill_sync + a note that sync runs via MCP/meta-skill, not a CLI
// subcommand (the real CLI only ships import/diff/pull/apply).
// ---------------------------------------------------------------------------
describe('Item 4 — no `loopskill sync` CLI-form string anywhere in docs', () => {
  const targets: [string, string][] = [
    ['getting-started.astro', p('src/pages/docs/getting-started.astro')],
    ['fleet.astro', p('src/pages/docs/fleet.astro')],
    ['how-it-works.astro', p('src/pages/docs/how-it-works.astro')],
    ['creator-workflow.astro', p('src/pages/docs/creator-workflow.astro')],
  ];

  for (const [name, path] of targets) {
    const src = readSrc(path);

    it(`${name}: does not contain the CLI-form "loopskill sync"`, () => {
      expect(src).not.toMatch(/\bloopskill sync\b/);
    });

    it(`${name}: still references a real loopskill_sync-family MCP tool (loopskill_sync or loopskill_fleet_sync)`, () => {
      expect(src).toMatch(/loopskill_(fleet_)?sync\b/);
    });
  }

  it('fleet.astro nightly-cron example no longer invokes a nonexistent `loopskill sync` subcommand', () => {
    const src = readSrc(p('src/pages/docs/fleet.astro'));
    expect(src).not.toMatch(/loopskill sync\s*>>/);
  });
});

// ---------------------------------------------------------------------------
// Items 5-7 — api-reference.astro: ?slug= -> ?skill=, POST /api-keys ->
// POST /api/api-keys, limit -> page_size (trending).
// ---------------------------------------------------------------------------
describe('Items 5-7 — api-reference.astro param/path fixes', () => {
  const API_REF = p('src/pages/docs/api-reference.astro');
  const src = readSrc(API_REF);

  it('item 5: /api/skills/access example uses ?skill= not ?slug=', () => {
    expect(src).toContain('skills/access?skill=');
    expect(src).not.toMatch(/skills\/access\?slug=/);
  });

  it('item 6: API keys endpoints are documented under /api/api-keys, not root /api-keys', () => {
    expect(src).toContain('<h3>POST /api/api-keys</h3>');
    expect(src).toContain('<h3>GET /api/api-keys</h3>');
    expect(src).toContain('<h3>DELETE /api/api-keys/');
    expect(src).not.toMatch(/<h3>(POST|GET) \/api-keys/);
    expect(src).not.toMatch(/DELETE \/api-keys\//);
  });

  it('item 7: trending example + query-param docs use page_size, not limit', () => {
    expect(src).toContain('trending?period=week&page_size=10');
    expect(src).not.toMatch(/trending\?period=week&limit=/);
    expect(src).toMatch(/page_size<\/code>\s*\(1[\u2013-]100/);
  });
});

// ---------------------------------------------------------------------------
// Item 8 — client-reporter (dead example, 401s) swapped for super-memory
// (live free-tier, 200 unauth) in install.astro + api-reference.astro; the
// "every install needs a key" overclaim is softened to match live behavior.
// ---------------------------------------------------------------------------
describe('Item 8 — install examples use a genuinely free-tier slug; auth claim matches live behavior', () => {
  const INSTALL = p('src/pages/docs/install.astro');
  const API_REF = p('src/pages/docs/api-reference.astro');
  const installSrc = readSrc(INSTALL);
  const apiRefSrc = readSrc(API_REF);

  it('install.astro no-auth example installs super-memory, not client-reporter', () => {
    expect(installSrc).toContain('skills/install?slug=super-memory');
    expect(installSrc).not.toMatch(/skills\/install\?slug=client-reporter/);
  });

  it('api-reference.astro no longer claims every install needs a key including free-tier', () => {
    expect(apiRefSrc).not.toContain('every install needs a key');
    expect(apiRefSrc).not.toContain('All install and write endpoints require');
  });

  it('api-reference.astro states free-tier installs are anonymous', () => {
    expect(apiRefSrc.toLowerCase()).toMatch(/free-tier (skill )?installs? (are|install) (public|anonymous)/);
  });
});

// ---------------------------------------------------------------------------
// Item 9 — dated correction banner prepended to the 4 Recipes-era blog
// posts teaching dead commands. Body must remain intact (non-empty content
// after the banner).
// ---------------------------------------------------------------------------
describe('Item 9 — correction banners on the 4 Recipes-era blog posts', () => {
  const posts = [
    'why-ai-agents-need-skills-not-prompts.md',
    'automate-client-reporting-five-minutes.md',
    'gohighlevel-cli-for-agencies.md',
    'super-memory-free-agent-memory.md',
  ];

  for (const post of posts) {
    const path = p('src/content/blog', post);
    const src = readSrc(path);

    it(`${post}: exists`, () => {
      expect(existsSync(path)).toBe(true);
    });

    it(`${post}: carries the dated 2026-08-25 correction banner`, () => {
      expect(src).toMatch(/> \*\*Correction \(2026-08-25\):\*\*/);
      expect(src).toContain('predates the Recipes\u2192LoopSkill rename');
      expect(src).toContain('/docs/install');
    });

    it(`${post}: banner sits right after frontmatter, body preserved after it`, () => {
      const fmEnd = src.indexOf('---', src.indexOf('---') + 3) + 3;
      const afterFrontmatter = src.slice(fmEnd);
      expect(afterFrontmatter).toMatch(/> \*\*Correction \(2026-08-25\):\*\*/);
      // Body content still present after the banner (file isn't just the banner).
      const bannerEnd = afterFrontmatter.indexOf('the install guide](/docs/install).') + 'the install guide](/docs/install).'.length;
      const body = afterFrontmatter.slice(bannerEnd).trim();
      expect(body.length).toBeGreaterThan(100);
    });
  }
});

// ---------------------------------------------------------------------------
// Item 10 — v0.5.0-creator-onboarding.md: Acknowledgements internal-diary
// section removed (budget/spend, vault path, sprint codename); release-notes
// body (through Coverage) kept intact.
// ---------------------------------------------------------------------------
describe('Item 10 — v0.5.0 blog post: internal-diary Acknowledgements section removed', () => {
  const POST = p('src/content/blog/v0.5.0-creator-onboarding.md');
  const src = readSrc(POST);

  it('file exists', () => {
    expect(existsSync(POST)).toBe(true);
  });

  it('no Acknowledgements heading remains', () => {
    expect(src).not.toMatch(/##\s*Acknowledgements/i);
  });

  it('no budget/spend figures remain', () => {
    expect(src).not.toMatch(/\$210/);
    expect(src).not.toMatch(/10\u00d7 budget/);
  });

  it('no internal vault path or sprint codename remains', () => {
    expect(src).not.toContain('obsidian-vault');
    expect(src).not.toContain('recipes_2006_legacy_cleanup');
  });

  it('release-notes body is still intact (Coverage section present)', () => {
    expect(src).toMatch(/##\s*Coverage/);
    expect(src).toContain('1641 passing');
  });
});

// ---------------------------------------------------------------------------
// Item 11 — brand-residue sweep: no fictional `recipes install` / `recipes
// verify` / `recipes fork` / `recipes add` CLI strings remain in the 6 swept
// pages (the real CLI never had these subcommands — the honest replacement
// is an agent-phrase or a documented MCP tool, never a fictional
// `loopskill install/verify/fork/add` command either).
// ---------------------------------------------------------------------------
describe('Item 11 — brand residue sweep: no dead recipes-era CLI strings', () => {
  const sweptPages: [string, string][] = [
    ['security.astro', p('src/pages/security.astro')],
    ['privacy.astro', p('src/pages/privacy.astro')],
    ['integrations.astro', p('src/pages/integrations.astro')],
    ['skills/external.astro', p('src/pages/skills/external.astro')],
    ['dashboard/forks.astro', p('src/pages/dashboard/forks.astro')],
    ['docs/fleet.astro', p('src/pages/docs/fleet.astro')],
  ];

  const deadCommandPattern = /\brecipes (install|verify|fork|add|publish-fork)\b/;

  for (const [name, path] of sweptPages) {
    const src = readSrc(path);

    it(`${name}: exists`, () => {
      expect(existsSync(path)).toBe(true);
    });

    it(`${name}: no dead \`recipes install/verify/fork/add\` CLI string`, () => {
      expect(src).not.toMatch(deadCommandPattern);
    });

    it(`${name}: no fictional \`loopskill install/verify/fork/add\` CLI string either (the real CLI only has import/diff/pull/apply)`, () => {
      expect(src).not.toMatch(/\bloopskill (install|verify|fork|add)\b/);
    });
  }

  it('integrations.astro: skill-directory paths use /loopskill/, not /recipes/', () => {
    const src = readSrc(p('src/pages/integrations.astro'));
    expect(src).not.toMatch(/skills\/recipes\//);
    expect(src).toMatch(/skills\/loopskill\//);
  });

  it('dashboard/forks.astro: no longer instructs users to run a fictional `recipes fork` CLI command', () => {
    const src = readSrc(p('src/pages/dashboard/forks.astro'));
    expect(src).not.toMatch(/Run <code>recipes fork/);
  });
});

// ---------------------------------------------------------------------------
// Item 12 — RECIPES_TELEMETRY keeps its name (the code only reads this exact
// var) but carries a "(legacy variable name, still canonical)" footnote at
// first mention on each of the 3 pages.
// ---------------------------------------------------------------------------
describe('Item 12 — RECIPES_TELEMETRY footnote at first mention', () => {
  const targets: [string, string][] = [
    ['privacy.astro', p('src/pages/privacy.astro')],
    ['docs/security.astro', p('src/pages/docs/security.astro')],
    ['docs/how-it-works.astro', p('src/pages/docs/how-it-works.astro')],
  ];

  for (const [name, path] of targets) {
    const src = readSrc(path);

    it(`${name}: still references RECIPES_TELEMETRY (the code's actual var name)`, () => {
      expect(src).toContain('RECIPES_TELEMETRY');
    });

    it(`${name}: carries the "legacy variable name, still canonical" footnote`, () => {
      expect(src).toMatch(/legacy variable name,?\s*still canonical/);
    });
  }
});

// ---------------------------------------------------------------------------
// Item 13 — tier vocabulary cook|operator -> free|pro|pro_plus in the 4
// named docs pages (legacy aliases are >2 months past their documented
// removal date; canonical tiers only in these docs).
// ---------------------------------------------------------------------------
describe('Item 13 — canonical tier vocabulary (no cook|operator tokens) in the 4 fixed docs pages', () => {
  const targets: [string, string][] = [
    ['api-reference.astro', p('src/pages/docs/api-reference.astro')],
    ['docs/security.astro', p('src/pages/docs/security.astro')],
    ['publishing.astro', p('src/pages/docs/publishing.astro')],
    ['creator-workflow.astro', p('src/pages/docs/creator-workflow.astro')],
  ];

  for (const [name, path] of targets) {
    const src = readSrc(path);

    it(`${name}: no bare \`cook\` tier token`, () => {
      expect(src).not.toMatch(/\bcook\b/);
    });

    it(`${name}: no bare \`operator\` tier token`, () => {
      expect(src).not.toMatch(/\boperator\b/);
    });

    it(`${name}: uses canonical pro / pro_plus tier vocabulary`, () => {
      expect(src.toLowerCase()).toMatch(/pro_plus|"pro"|>pro</i);
    });
  }
});

// ---------------------------------------------------------------------------
// Bonus — docs/mcp.astro recommends `uvx loopskill-mcp` as the first/
// RECOMMENDED option (verified live on PyPI 2026-08-25), with the raw
// StreamableHTTP JSON config kept as the manual alternative.
// ---------------------------------------------------------------------------
describe('Bonus — uvx loopskill-mcp is documented as the recommended MCP install path', () => {
  const MCP = p('src/pages/docs/mcp.astro');
  const src = readSrc(MCP);

  it('mcp.astro exists', () => {
    expect(existsSync(MCP)).toBe(true);
  });

  it('mcp.astro contains the `uvx loopskill-mcp` command', () => {
    expect(src).toContain('uvx');
    expect(src).toContain('loopskill-mcp');
    expect(src).toMatch(/"command":\s*"uvx"/);
    expect(src).toMatch(/"args":\s*\["loopskill-mcp"\]/);
  });

  it('mcp.astro still documents the raw StreamableHTTP JSON config as the manual alternative', () => {
    expect(src).toContain('https://app.loopskill.io/api/mcp/http/');
    expect(src).toMatch(/manual/i);
  });

  it('mcp.astro does not overclaim anonymous MCP access (verified live: anonymous tools/list -> 401)', () => {
    // The uvx bridge's own README claims free-tier lookups work anonymously,
    // but the live MCP server 401s on every call regardless of transport —
    // this doc must not repeat the unverified README claim as fact.
    expect(src).not.toMatch(/works anonymously with no key set at all/);
  });
});
