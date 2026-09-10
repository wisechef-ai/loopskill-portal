/**
 * issue157-share-tokens-canonical-bundles — docs/share-tokens.astro must
 * teach /api/bundles/* as the canonical path, not /api/cookbooks/* as
 * primary.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * issue #157 (cookbook→bundle rename) tracked this page as a gap in its own
 * last comment: the four command samples on /docs/share-tokens all showed
 * `/api/cookbooks/{cookbook_id}/...` as the primary command, with zero
 * mention that `/api/bundles` is canonical and `/api/cookbooks` is a
 * documented compat-alias (confirmed at the source of truth:
 * app/share_token_routes.py:503-505 — `router.include_router(_h,
 * prefix="/api/bundles")` mounted before the `# compat-alias` cookbooks
 * mount). Docs should teach the canonical route first, same convention as
 * api-reference.astro (which already gets this right — see the "still works
 * as a backward-compatible alias" footnote pattern this test also requires
 * here).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SHARE_TOKENS = join(ROOT, 'src/pages/docs/share-tokens.astro');
const src = readFileSync(SHARE_TOKENS, 'utf-8');

describe('issue #157 — share-tokens.astro teaches /api/bundles as canonical', () => {
  it('every command sample (POST mint, POST rotate, DELETE revoke) uses /api/bundles/{bundle_id}, not /api/cookbooks/{cookbook_id}', () => {
    const codeBlocks = [...src.matchAll(/<code>((?:POST|DELETE)[^<]*share-tokens[^<]*)<\/code>/g)].map(
      (m) => m[1],
    );
    expect(codeBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of codeBlocks) {
      expect(block).toMatch(/^(?:POST|DELETE) \/api\/bundles\//);
      expect(block).not.toContain('/api/cookbooks/');
    }
  });

  it('documents /api/cookbooks/* as a backward-compatible alias (does not silently drop the fact it still works)', () => {
    expect(src).toMatch(/\/api\/cookbooks\/\*[\s\S]{0,200}backward-compatible alias/);
  });

  it('the "what it cannot reach" restriction line names /api/bundles/* as the reachable surface', () => {
    const restrictionLine = src.match(/Any route outside[\s\S]*?<\/span>/)?.[0] ?? '';
    expect(restrictionLine).toContain('/api/bundles/*');
  });
});
