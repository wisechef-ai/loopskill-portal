import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.astro') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some(e => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

describe('six-fixes-a regressions', () => {
  it('no source file contains the broken arbitrary-value grid class', () => {
    // Built via concatenation so Tailwind's naive project-wide class
    // scanner does not itself pick up this literal and regenerate the
    // very utility we're asserting is gone (bit us during verification).
    const bannedClass = 'grid-cols-' + '[1.05fr_1fr]';
    const files = walk(path.join(ROOT, 'src'), ['.astro', '.ts', '.tsx', '.js', '.jsx']);
    const offenders: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes(bannedClass)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('AgentMark.astro no longer exists and no src file imports it', () => {
    const markPath = path.join(ROOT, 'src/components/AgentMark.astro');
    expect(fs.existsSync(markPath)).toBe(false);

    const files = walk(path.join(ROOT, 'src'), ['.astro', '.ts', '.tsx', '.js', '.jsx']);
    const importers: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (/AgentMark/.test(content)) importers.push(f);
    }
    expect(importers).toEqual([]);
  });

  it('no invented-glyph integration SVGs remain referenced', () => {
    const iconsDir = path.join(ROOT, 'public/icons/integrations');
    expect(fs.existsSync(iconsDir)).toBe(false);

    const files = walk(path.join(ROOT, 'src'), ['.astro', '.ts', '.tsx', '.js', '.jsx']);
    const referrers: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('icons/integrations')) referrers.push(f);
    }
    expect(referrers).toEqual([]);
  });
});
