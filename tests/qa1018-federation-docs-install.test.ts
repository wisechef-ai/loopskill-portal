/**
 * qa1018 — launch-QA clusters C20 (federation propose form) + NNS-14
 * (/docs/install one recommended path). Source-string tests only: no dist/,
 * no network.
 *
 * C20 / BRK-1: 'javascript:alert(1)' was accepted as a repo URL and filed a
 *   real proposal. The form now requires a public GitHub repo URL (input
 *   pattern + JS check before fetch).
 * C20 / BRK-2: a 422 string_too_long on `why` showed a blank "Not filed:".
 *   The textarea now has maxlength=2048 and every non-2xx shows a reason.
 * NNS-14: /docs/install listed 4 install ways at once with jargon. It now
 *   leads with ONE keyless paste (META_INSTALL_PHRASE) and moves the rest
 *   under "Other ways". MOB-10: long commands wrap at 375px.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { META_INSTALL_PHRASE } from '../src/lib/agentInstall';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const FED = readFileSync(join(ROOT, 'src/pages/federation/index.astro'), 'utf-8');
const INSTALL = readFileSync(join(ROOT, 'src/pages/docs/install.astro'), 'utf-8');

function proposeScript(): string {
  const start = FED.indexOf('// Registry-proposal island');
  const end = FED.indexOf('</script>', start);
  expect(start).toBeGreaterThan(-1);
  return FED.slice(start, end);
}

describe('C20 / BRK-1 — propose form only accepts public GitHub repo URLs', () => {
  const m = FED.match(/const PROPOSE_REPO_URL_PATTERN = String\.raw`([^`]+)`;/);

  it('declares the pattern in frontmatter and binds it as an expression (literal attrs lose backslashes)', () => {
    expect(m).not.toBeNull();
    expect(FED).toContain('pattern={PROPOSE_REPO_URL_PATTERN}');
    expect(FED).not.toMatch(/pattern="https:\/\/github/);
  });

  it('the pattern compiles in v-flag mode (how browsers compile `pattern`) and rejects junk', () => {
    const re = new RegExp('^(?:' + m![1] + ')$', 'v');
    for (const ok of ['https://github.com/owner/repo', 'https://github.com/owner/repo/', 'https://github.com/a-b/c.d_e']) {
      expect(re.test(ok), ok).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/owner', 'https://githubXcom/a/b', 'https://github.com/a/b/tree/main']) {
      expect(re.test(bad), bad).toBe(false);
    }
  });

  it('the repo input is type=url, required, with a plain-words title + helper text', () => {
    const input = FED.match(/<input id="propose-repo-url"[\s\S]*?\/>/)?.[0] || '';
    expect(input).toContain('type="url"');
    expect(input).toContain('required');
    expect(input).toContain('title="Must be a public GitHub repo URL like https://github.com/owner/repo"');
    expect(FED).toMatch(/id="propose-repo-url-help"[^>]*>Must be a public GitHub repo URL like https:\/\/github\.com\/owner\/repo</);
  });

  it('the submit JS validates the URL BEFORE fetch, with the same rule', () => {
    const js = proposeScript();
    const reSrc = js.match(/var REPO_URL_RE = (\/.+\/);/)?.[1];
    expect(reSrc).toBeTruthy();
    // eslint-disable-next-line no-eval
    const re: RegExp = (0, eval)(reSrc!);
    expect(re.test('https://github.com/owner/repo')).toBe(true);
    expect(re.test('javascript:alert(1)')).toBe(false);
    expect(js.indexOf('REPO_URL_RE.test(repoUrl)')).toBeGreaterThan(-1);
    expect(js.indexOf('REPO_URL_RE.test(repoUrl)')).toBeLessThan(js.indexOf('fetch('));
  });
});

describe('C20 / BRK-2 — never a blank "Not filed:"', () => {
  it('why is a textarea capped at the server limit (2048)', () => {
    expect(FED).toMatch(/<textarea id="propose-why"[^>]*maxlength="2048"/);
    expect(FED).not.toMatch(/<input id="propose-why"/);
  });

  it('errorText() turns FastAPI 422 / string / unknown errors into a non-empty reason', () => {
    const js = proposeScript();
    const fnSrc = js.slice(js.indexOf('function errorText'), js.indexOf("btn.addEventListener('click'"));
    const labels = js.match(/var FIELD_LABELS = (\{[^}]+\});/)![1];
    // eslint-disable-next-line no-new-func
    const errorText = new Function(`var FIELD_LABELS = ${labels}; ${fnSrc}; return errorText;`)() as (s: number, d: unknown) => string;

    expect(errorText(422, { detail: [{ type: 'string_too_long', loc: ['body', 'why'], msg: 'String should have at most 2048 characters' }] }))
      .toBe('Why — String should have at most 2048 characters');
    expect(errorText(422, { detail: [{ loc: ['body', 'repo_url'], msg: 'Field required' }] })).toBe('Repo URL — Field required');
    expect(errorText(400, { detail: 'Repo not found' })).toBe('Repo not found');
    expect(errorText(429, { detail: 'rate_limit_exceeded' })).toMatch(/^Rate limit:/);
    expect(errorText(400, { detail: { error: 'bad repo' } })).toBe('bad repo');
    for (const d of [{}, { detail: [] }, { detail: '' }, { detail: {} }, null]) {
      const t = errorText(502, d);
      expect(t.trim().length).toBeGreaterThan(0);
      expect(t).toContain('HTTP 502');
    }
  });

  it('non-2xx is routed through errorText; non-JSON bodies are tolerated', () => {
    const js = proposeScript();
    expect(js).toContain("show('err', 'Not filed: ' + errorText(res.status, d));");
    expect(js).toContain('r.text()');
    expect(js).toContain('res.ok && d.ok');
  });

  it('server strings are rendered as text, never parsed as HTML', () => {
    expect(FED).not.toContain('innerHTML');
    expect(proposeScript()).toContain('createTextNode');
  });
});

describe('NNS-14 — /docs/install leads with ONE recommended path', () => {
  const recIdx = INSTALL.indexOf('id="recommended"');
  const otherIdx = INSTALL.indexOf('id="other-ways"');

  it('META_INSTALL_PHRASE is the canonical keyless phrase', () => {
    expect(META_INSTALL_PHRASE).toBe('Install the loopskill skill from https://app.loopskill.io/skill');
  });

  it('renders the shared constant in the copyable block (shown text === copied text)', () => {
    expect(INSTALL).toMatch(/import \{ META_INSTALL_PHRASE \} from '\.\.\/\.\.\/lib\/agentInstall'/);
    expect(INSTALL).toContain('<code id="docs-install-phrase">{META_INSTALL_PHRASE}</code>');
    expect(INSTALL).toContain("document.getElementById('docs-install-phrase')?.textContent");
  });

  it('no key placeholder in any copyable phrase', () => {
    expect(INSTALL).not.toContain('YOUR_KEY_FROM_LIBRARY');
    expect(INSTALL).not.toMatch(/as LOOPSKILL_API_KEY/);
  });

  it('heading, where-to-paste line and key rule are in plain words near the top', () => {
    expect(INSTALL).toContain('Using Claude Code, Codex or Cursor? Paste this into the chat');
    expect(INSTALL).toContain("Paste this into your agent's chat (Claude Code, Codex, Cursor…) and press Enter.");
    const keyRule = INSTALL.indexOf('Free skills: no key. MCP tools: need a free API key.');
    expect(keyRule).toBeGreaterThan(-1);
    expect(keyRule).toBeLessThan(recIdx);
  });

  it('copy button is at least 44px tall', () => {
    expect(INSTALL).toMatch(/id="docs-install-phrase-copy"[^>]*min-h-\[44px\]/);
  });

  it('MCP, plugin marketplace, skill file and raw HTTP all sit below "Other ways"', () => {
    expect(recIdx).toBeGreaterThan(-1);
    expect(otherIdx).toBeGreaterThan(recIdx);
    expect(INSTALL).toMatch(/id="other-ways">Other ways</);
    for (const id of ['mcp-server', 'claude-code-plugin', 'skill-file', 'raw-http']) {
      const i = INSTALL.indexOf(`id="${id}"`);
      expect(i, id).toBeGreaterThan(otherIdx);
    }
  });

  it('jargon replaced with plain explanations', () => {
    expect(INSTALL).not.toContain('StreamableHTTP');
    expect(INSTALL).not.toContain('stdio');
    expect(INSTALL).not.toContain('PyPI bridge');
    expect(INSTALL).not.toMatch(/meta-skill/i);
    expect(INSTALL).toContain('uvx loopskill-mcp');
  });

  it('long commands wrap at 375px instead of side-scrolling (MOB-10)', () => {
    expect(INSTALL).toMatch(/\.install-cmd\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/);
    const pres = INSTALL.match(/<pre[^>]*>/g) || [];
    expect(pres.length).toBeGreaterThanOrEqual(10);
    for (const pre of pres) {
      expect(pre).toContain('install-cmd');
      expect(pre).not.toContain('overflow-x-auto');
    }
  });

  it('keeps the existing technical facts', () => {
    expect(INSTALL).toContain('https://app.loopskill.io/api/mcp/http/');
    expect(INSTALL).toContain('/plugin marketplace add wisechef-ai/loopskill-marketplace');
    expect(INSTALL).toContain('curl -sL https://app.loopskill.io/skill -o ~/.claude/skills/loopskill/SKILL.md');
    expect(INSTALL).toContain('skills/install?slug=super-memory');
    expect(INSTALL.toLowerCase()).toMatch(/mcp server requires (an? )?(api )?key/);
  });
});
