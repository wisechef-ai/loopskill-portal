/**
 * qa1018 C06 — bundle pages lead with the agent phrase (launch QA: IMP-5, MOB-1,
 * MOB-5, MOB-8, MOB-10, MOB-11, NNS-12, SKP-07, BRK-11).
 *
 * src/pages/bundles/p.astro is a define:vars (=> is:inline) script and cannot
 * import src/lib/agentInstall.ts, so it MIRRORS META_INSTALL_PHRASE +
 * freshAgentPhrase(). This file extracts that mirror, executes it, and asserts
 * it is byte-identical to the canonical output. [slug].astro imports the
 * canonical function directly (frontmatter), which is asserted too.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { freshAgentPhrase, META_INSTALL_PHRASE } from '../src/lib/agentInstall';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const P = readFileSync(join(ROOT, 'src', 'pages', 'bundles', 'p.astro'), 'utf-8');
const SLUG = readFileSync(join(ROOT, 'src', 'pages', 'bundles', '[slug].astro'), 'utf-8');
const VIEW = readFileSync(join(ROOT, 'src', 'pages', 'bundles', 'view.astro'), 'utf-8');

const PASTE_LINE = "Paste this into your agent's chat (Claude Code, Codex, Cursor…) and press Enter.";

function extractMirror(src: string): (kind: string, slug: string) => string {
  const constM = src.match(/const META_INSTALL_PHRASE = ("[^"]*");/);
  const fnM = src.match(/function freshAgentPhrase\(kind, slug\) \{[\s\S]*?\n  \}/);
  if (!constM || !fnM) throw new Error('inline freshAgentPhrase mirror not found in p.astro');
  // eslint-disable-next-line no-new-func
  return new Function(`const META_INSTALL_PHRASE = ${constM[1]};\n${fnM[0]}\nreturn freshAgentPhrase;`)();
}

describe('qa1018 C06 — p.astro inline mirror of freshAgentPhrase', () => {
  it('the inline META_INSTALL_PHRASE equals the canonical one', () => {
    expect(P).toContain(`const META_INSTALL_PHRASE = "${META_INSTALL_PHRASE}";`);
  });

  it('executing the mirror yields exactly freshAgentPhrase("bundle", …)', () => {
    const mirror = extractMirror(P);
    for (const slug of ['x', 'seo-and-search-growth', 'a"b']) {
      expect(mirror('bundle', slug)).toBe(freshAgentPhrase('bundle', slug));
    }
  });

  it('the static placeholder in #agent-line is the canonical phrase shape', () => {
    expect(P).toContain(`<code id="agent-line">${freshAgentPhrase('bundle', '…')}</code>`);
  });

  it('shown === copied: the agent line and its Copy button use the same variable', () => {
    expect(P).toMatch(/const agentLine = freshAgentPhrase\("bundle", bundleSlug\);/);
    expect(P).toMatch(/agentEl\.textContent = agentLine;/);
    expect(P).toMatch(/wireCopy\(\$\("copy-agent-btn"\),\s*\(\)\s*=>\s*agentLine\)/);
  });

  it('no Copy button on the page copies a loopskill_bundle_install(...) MCP call as the primary', () => {
    expect(P).not.toMatch(/loopskill_bundle_install\(/);
  });
});

describe('qa1018 C06 — install block layout (p.astro and [slug].astro)', () => {
  for (const [name, src] of [['p.astro', P], ['[slug].astro', SLUG]] as const) {
    describe(name, () => {
      it('primary = agent phrase, preceded by the plain "where to paste" line', () => {
        const pasteIdx = src.indexOf(PASTE_LINE);
        const agentIdx = src.indexOf('id="agent-line"');
        expect(pasteIdx).toBeGreaterThan(-1);
        expect(agentIdx).toBeGreaterThan(pasteIdx);
        expect(src).not.toMatch(/\bplease\b/i);
      });

      it('curl|bash is secondary under "Prefer a terminal?" with the terminal / ~/.claude/skills / bash+python3 note', () => {
        const termIdx = src.indexOf('>Prefer a terminal?</h3>');
        expect(termIdx).toBeGreaterThan(src.indexOf('id="agent-line"'));
        expect(src.indexOf('id="install-line"')).toBeGreaterThan(termIdx);
        expect(src).toContain("not in your agent's chat");
        expect(src).toContain('~/.claude/skills');
        expect(src).toMatch(/<code>bash<\/code> and <code>python3<\/code>/);
        expect(src).not.toMatch(/Runs in any shell/);
      });

      it('"Other ways to install" is a >=44px disclosure with the MCP option labelled for key holders', () => {
        expect(src).toMatch(/<summary class="bd-other-summary">Other ways to install<\/summary>/);
        expect(src).toMatch(/\.bd-other-summary \{[^}]*min-height: 44px/);
        expect(src).toContain('Already have LoopSkill connected (API key)?');
        // Main path is OUTSIDE the details.
        expect(src.indexOf('id="agent-line"')).toBeLessThan(src.indexOf('<details'));
      });

      it('long commands wrap instead of side-scrolling', () => {
        expect(src).toMatch(/\.bd-pre \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere/);
        expect(src).toMatch(/code\.bd-break \{ word-break: break-all; \}/);
        expect(src).not.toMatch(/<pre[^>]*overflow-x-auto/);
      });

      it('every Copy button is >=44px tall', () => {
        expect(src).toMatch(/\.bd-copy \{[^}]*min-height: 44px/);
        const copyButtons = src.match(/<button[^>]*>Copy<\/button>/g) || [];
        expect(copyButtons.length).toBeGreaterThan(0);
        for (const b of copyButtons) expect(b).toMatch(/class="bd-copy"/);
      });

      it('member rows show the source owner/repo and plain-words trust labels', () => {
        expect(src).toMatch(/function sourceLabel\(/);
        expect(src).toContain('Community skill — not reviewed by LoopSkill');
        expect(src).not.toContain('community · as-is');
        expect(src).not.toContain('Deep-link bundle — installs from the original GitHub repo');
        expect(src).toContain('Skills install straight from their original GitHub repos (LoopSkill does not host a copy).');
        // "custom-added" is never shown as a label.
        expect(src).toMatch(/s\.source === ['"]custom-added['"] \? ['"]['"]/);
      });

      it('does not claim the bundle is security-vetted', () => {
        expect(src).not.toMatch(/security-vetted/);
      });
    });
  }

  it('[slug].astro renders the CANONICAL phrase (imported, not mirrored) and drops the MCP-first QuickInstall', () => {
    expect(SLUG).toMatch(/import \{ freshAgentPhrase \} from '\.\.\/\.\.\/lib\/agentInstall';/);
    expect(SLUG).toContain("agentLine: freshAgentPhrase('bundle', slug as string)");
    expect(SLUG).toMatch(/<code id="agent-line">\{display\.agentLine\}<\/code>/);
    expect(SLUG).toMatch(/data-copy=\{display\.agentLine\}/);
    expect(SLUG).not.toMatch(/<QuickInstall/);
  });

  it('p.astro renders upstream strings with textContent only (owner/repo subtitle)', () => {
    expect(P).toMatch(/originEl\.textContent = `from \$\{origin\}`/);
    expect(P).not.toMatch(/originEl\.innerHTML/);
  });

  it('p.astro hides "Other ways to install" when it has no visible option (never an empty heading)', () => {
    expect(P).toMatch(/data-install-option/);
    expect(P).toMatch(/otherWays\.hidden = !anyOption/);
  });
});

describe('qa1018 C06 — sourceLabel() derivation (p.astro inline helper)', () => {
  const m = P.match(/function sourceLabel\(url\) \{[\s\S]*?\n  \}/);
  // eslint-disable-next-line no-new-func
  const sourceLabel = new Function(`${m![0]}\nreturn sourceLabel;`)() as (u: unknown) => string;
  it('github tree URL -> owner/repo', () => {
    expect(sourceLabel('https://github.com/coreyhaines31/marketingskills/tree/main/skills/ai-seo')).toBe('coreyhaines31/marketingskills');
  });
  it('other host -> hostname; relative/invalid -> empty', () => {
    expect(sourceLabel('https://www.example.org/x/y')).toBe('example.org');
    expect(sourceLabel('/skills/x')).toBe('');
    expect(sourceLabel('javascript:alert(1)')).toBe('');
    expect(sourceLabel(null)).toBe('');
  });
});

describe('qa1018 C06 — view.astro (member view) Copy target', () => {
  it('the share-link Copy button is >=44px tall', () => {
    expect(VIEW).toMatch(/id="cb-share-copy"[^>]*min-height:44px/);
  });
});
