/**
 * pricing0928 (t_7f5808d2, option C) — the install path's one account line.
 *
 * 1. install.sh prints an optional sign-in line after a SUCCESSFUL anonymous
 *    install, and never when LOOPSKILL_API_KEY is set. It is not a gate: the
 *    line comes after the tarball is extracted and the "Done." line.
 * 2. The link carries utm_source=install (not ?ref=, which /signin drops unless
 *    it matches the WIS-660 referral-code shape).
 * 3. /signin forwards utm_* onto the OAuth login links, so the attribution
 *    survives to the API's signup-attribution cookie.
 *
 * The install.sh test executes the real script against a stub API (a local
 * python http.server serving a fixture JSON + tarball), so it checks behaviour,
 * not just source text.
 */
import { execFileSync, spawn } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const INSTALL_SH = join(ROOT, 'public', 'install.sh');
const SIGNIN = readFileSync(join(ROOT, 'src', 'pages', 'signin.astro'), 'utf-8');

let server: ReturnType<typeof spawn> | undefined;
let base = '';
let work = '';

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'ls-install-'));
  const pkg = join(work, 'pkg');
  mkdirSync(pkg);
  writeFileSync(join(pkg, 'SKILL.md'), '# hint-demo\n');
  execFileSync('tar', ['-czf', join(work, 'skill.tgz'), '-C', pkg, 'SKILL.md']);
  const sha = createHash('sha256').update(readFileSync(join(work, 'skill.tgz'))).digest('hex');
  const port = 20000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  mkdirSync(join(work, 'api', 'skills'), { recursive: true });
  writeFileSync(
    join(work, 'api', 'skills', 'install'),
    JSON.stringify({ slug: 'hint-demo', version: '1.0.0', tarball_url: '/skill.tgz', checksum_sha256: sha }),
  );
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: work,
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      execFileSync('curl', ['-sf', '-o', '/dev/null', `${base}/skill.tgz`]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('stub API did not start');
});

afterAll(() => {
  server?.kill();
});

function runInstall(env: Record<string, string>): string {
  return execFileSync('bash', [INSTALL_SH, 'hint-demo'], {
    env: { PATH: process.env.PATH ?? '', HOME: work, LOOPSKILL_API_BASE: base, LOOPSKILL_INSTALL_DIR: join(work, 'out'), ...env },
    encoding: 'utf-8',
  });
}

describe('install.sh account hint', () => {
  it('prints one optional sign-in line after a successful anonymous install', () => {
    const out = runInstall({});
    const lines = out.trim().split('\n');
    expect(out).toContain("installed 'hint-demo'");
    const hint = lines[lines.length - 1];
    expect(hint).toMatch(/^Optional, free: sign in/);
    expect(hint).toContain(`${base}/signin?next=/library&utm_source=install&utm_medium=cli&utm_campaign=hint-demo`);
    expect(hint).not.toMatch(/ref=/);
    expect(hint.toLowerCase()).not.toMatch(/alert|notif/);
    // Comes after the success line: installing never waits on it.
    expect(out.indexOf('Done.')).toBeLessThan(out.indexOf('Optional, free'));
    expect(out.match(/Optional, free/g)?.length).toBe(1);
  });

  it('prints no hint for a caller who already has a key', () => {
    const out = runInstall({ LOOPSKILL_API_KEY: 'rec_test_dummy' });
    expect(out).toContain("installed 'hint-demo'");
    expect(out).not.toContain('Optional, free');
  });
});

describe('/signin relays utm_* to the OAuth links', () => {
  it('forwards every utm field onto both provider links', () => {
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      expect(SIGNIN).toContain(`'${k}'`);
    }
    expect(SIGNIN).toContain("['google-login', 'github-login']");
  });
});
