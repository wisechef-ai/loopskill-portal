import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(new URL(import.meta.url).pathname, '../../');

function listAstroFiles(dir: string): string[] {
  const out = execSync(`find "${dir}" -name '*.astro' -not -path '*/node_modules/*'`, {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  return out.split('\n').filter(Boolean);
}

// Catalog-count claim: a 2-4 digit number (not part of a larger comma- or
// k-grouped figure like "80,000+" / "91k+" — those are the FEDERATED count,
// a different, explicitly-separate number this gate does not police) that
// sits directly next to the word "skill(s)". Threshold >=20 deliberately
// separates "N skills in THIS bundle/track" UI copy (small numbers, e.g.
// cookbook.astro's demo "4 skills · 3 agents synced", library.astro's live
// "0 skills" basket counter) from a claim about the CATALOG TOTAL (currently
// 57, historically "60+", "72" — always a two-digit-plus figure in this repo).
const CATALOG_COUNT_RE = /(?<![\d,])(\d{2,4})\+?\s+(free\s+|production-grade\s+|curated\s+|versioned\s+|signed\s+)*skills?\b/gi;

// Strip COMMENTS before matching. The gate polices what a visitor can READ on
// the page, not what a maintainer wrote about the gate. Without this, the very
// comment explaining "this used to say 72 skills" re-trips it — a doc that
// cannot describe the defect it fixed is a gate that punishes documentation.
// Stripped: .astro frontmatter `//` and `/* */`, and HTML `<!-- -->`.
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

describe('P0 gate — zero hardcoded catalog-skill counts on any page surface', () => {
  it('no .astro page hardcodes a catalog skill-count number (e.g. "72 skills", "60+ skills")', () => {
    const files = listAstroFiles(join(ROOT, 'src/pages')).concat(
      listAstroFiles(join(ROOT, 'src/components')),
      listAstroFiles(join(ROOT, 'src/layouts')),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf-8'));
      const matches = [...text.matchAll(CATALOG_COUNT_RE)];
      for (const m of matches) {
        offenders.push(`${file.replace(ROOT, '')}: "${m[0].trim()}"`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded catalog skill-count found (live /api/stats total_skills=57, not the number below):\n' +
          offenders.join('\n') +
          '\n\nRender this from a live fetchApi(\'/api/stats\' | \'/api/marketing/snapshot\') call instead — ' +
          'see src/pages/index.astro\'s liveSkillCount pattern.',
      );
    }
    expect(offenders).toEqual([]);
  });
});
