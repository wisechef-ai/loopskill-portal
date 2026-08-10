/**
 * mcp-docs-consolidation — issues #215, #216, #217, #218, #219(2,3).
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Five owner-filed docs-hygiene issues, all rooted in the same underlying
 * problem: three docs pages (`/docs/mcp`, `/docs/install`, `/docs/getting-
 * started`) each independently hand-wrote a different MCP connection method,
 * and two of the three were dead (SSE 405/500, a nonexistent
 * `wisechef-ai/loopskill-mcp` git repo, a `loopskill-mcp` PyPI package that
 * was never published). An agent following any single page's instructions
 * verbatim could not connect. Live-verified 2026-08-10 (see issue #215's
 * repro block) — this file locks the fix at the source-text level, the same
 * convention `ah0720-battle-tested-trust-line.test.ts` and
 * `mesh0408-w3-storefront-guards.test.ts` established for this repo, so a
 * future edit that reintroduces a dead path fails CI instead of shipping.
 *
 * Scope, one rule per issue:
 *   #215 — every docs page recommends ONE canonical MCP transport:
 *          POST https://app.loopskill.io/api/mcp/http/ (StreamableHTTP).
 *          No page may tell a reader to `git clone loopskill-mcp`,
 *          `pip install loopskill-mcp`, `uvx loopskill-mcp`, or hit
 *          `/api/mcp/sse` — all four are dead (verified: 404 repo, no PyPI
 *          package, 405/500 on SSE).
 *   #216 — /docs/mcp's tool list matches the real 45-tool MCP surface (no
 *          `loopskill_detail` / `loopskill_trending` / `loopskill_stats`,
 *          which do not exist as MCP tools).
 *   #217 — /docs/install no longer claims blanket "no auth for free skills"
 *          for the MCP path (the MCP server 401s on every call, keyed or
 *          not; only raw REST search + free install work keyless).
 *   #218 — llms.txt's install line documents the required `?slug=<slug>`
 *          query param (calling it bare 422s).
 *   #219 (items 2, 3) — getting-started's skill count is no longer a
 *          hardcoded "60+" (verified stale against live /api/stats == 57,
 *          and would drift again); llms.txt notes the connectors table can
 *          be legitimately empty.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const MCP = join(ROOT, 'src/pages/docs/mcp.astro');
const INSTALL = join(ROOT, 'src/pages/docs/install.astro');
const GETTING_STARTED = join(ROOT, 'src/pages/docs/getting-started.astro');
const NEW_AGENT = join(ROOT, 'src/pages/docs/new-agent.astro');
const VSCODE = join(ROOT, 'src/pages/docs/vscode.astro');
const LLMS_TXT_SRC = join(ROOT, 'src/pages/llms.txt.ts');

const DOC_PAGES: [string, string][] = [
  ['mcp.astro', MCP],
  ['install.astro', INSTALL],
  ['getting-started.astro', GETTING_STARTED],
  ['new-agent.astro', NEW_AGENT],
  ['vscode.astro', VSCODE],
];

function readSrc(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

describe('#215 — one canonical MCP transport across all docs pages', () => {
  for (const [name, path] of DOC_PAGES) {
    const src = readSrc(path);

    it(`${name}: recommends the canonical StreamableHTTP endpoint`, () => {
      expect(existsSync(path)).toBe(true);
      expect(src).toContain('https://app.loopskill.io/api/mcp/http/');
    });

    it(`${name}: does not reference the dead /api/mcp/sse path`, () => {
      expect(src).not.toContain('api/mcp/sse');
    });

    it(`${name}: does not tell readers to clone/pip/uvx the nonexistent loopskill-mcp package`, () => {
      expect(src).not.toMatch(/git clone.*loopskill-mcp/);
      expect(src).not.toMatch(/pip install (fastmcp|loopskill-mcp)/);
      expect(src).not.toMatch(/uvx loopskill-mcp/);
    });
  }
});

describe('#216 — /docs/mcp tool list matches the real 45-tool MCP surface', () => {
  const src = readSrc(MCP);

  it('does not claim the nonexistent loopskill_detail tool', () => {
    expect(src).not.toContain('loopskill_detail');
  });

  it('does not claim the nonexistent loopskill_trending tool', () => {
    expect(src).not.toContain('loopskill_trending');
  });

  it('does not claim the nonexistent loopskill_stats tool', () => {
    expect(src).not.toContain('loopskill_stats');
  });

  it('does not undersell the tool count as "six"/6 dedicated tools', () => {
    expect(src).not.toMatch(/\bsix\b.{0,20}tools/i);
  });

  it('references real tool names that do exist on the server', () => {
    expect(src).toContain('loopskill_search');
    expect(src).toContain('loopskill_install');
  });
});

describe('#217 — MCP auth claim is accurate (no blanket "no auth" for MCP)', () => {
  const src = readSrc(INSTALL);

  it('does not badge the MCP section "No auth for free skills"', () => {
    // The badge/copy previously implied the MCP server itself needs no key
    // for free skills. In truth the MCP server 401s unkeyed on every call;
    // only raw REST search/install work keyless. The badge text must not
    // appear anywhere near the MCP recommendation.
    expect(src).not.toContain('No auth for free skills');
  });

  it('clarifies the MCP server requires a key for all operations', () => {
    expect(src.toLowerCase()).toMatch(/mcp server requires (an? )?(api )?key/);
  });
});

describe('#218 — llms.txt install line documents the required slug param', () => {
  const src = readSrc(LLMS_TXT_SRC);

  it('the install endpoint line includes ?slug=<slug>, not a bare path', () => {
    expect(src).toMatch(/Install \(returns a signed tarball\).*\/api\/skills\/install\?slug=/);
  });
});

describe('#219 item 2 — getting-started renders a dynamic skill count, not a hardcoded "60+"', () => {
  const src = readSrc(GETTING_STARTED);

  it('does not hardcode "60+ skills" (verified stale: live /api/stats == 57)', () => {
    expect(src).not.toMatch(/60\+\s*skills/);
  });
});

describe('#219 item 3 — llms.txt notes the connector catalog can be legitimately empty', () => {
  const src = readSrc(LLMS_TXT_SRC);

  it('the Connectors section carries an empty-state note', () => {
    expect(src).toMatch(/## Connectors[\s\S]{0,400}(intentionally empty|can be empty|staged behind a review gate)/);
  });
});
