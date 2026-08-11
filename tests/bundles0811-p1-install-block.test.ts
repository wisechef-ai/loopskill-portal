/**
 * bundles_0811 P1 (F1 + F2) — the public bundle page must show a WORKING,
 * auth-free install line.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * The cold-path trace found that the only "take it" affordance a stranger saw
 * on a public bundle page was `clone_line`:
 *
 *     loopskill_bundle_install from "bundle://loopskill-essentials?ref=…"
 *
 * That is an MCP call, and `POST /api/mcp/http/` returns 401 for anonymous
 * users **by its own documented contract** (issue #217). So the single path
 * offered to a visitor could not be executed by that visitor — while a genuinely
 * anonymous install path existed and was never surfaced. The page also claimed
 * "No account required to install free skills" directly beneath the MCP line,
 * which was simply false for that line.
 *
 * api#226 shipped the API half (`install_command`, `install_command_requires_auth`,
 * `clone_line_requires_auth`). No portal PR ever rendered it — verified live:
 * `curl https://app.loopskill.io/bundles/p?slug=loopskill-essentials` contained
 * `loopskill_bundle_install` twice and `install.sh` zero times.
 *
 * These tests assert the RENDERED page, in dependency order:
 *   1. the auth-free command is present in the markup
 *   2. it appears BEFORE the MCP line (hero position, not buried)
 *   3. the MCP line is labelled as key-gated, never as open
 *   4. the false "No account required" claim is gone from the MCP paragraph
 *   5. the client JS actually populates the element from the API field
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const PAGE = join(ROOT, 'src', 'pages', 'bundles', 'p.astro');
const src = readFileSync(PAGE, 'utf-8');

describe('bundles_0811 P1 — auth-free install block on the public bundle page', () => {
  it('renders an install-line element for the auth-free command', () => {
    expect(src).toContain('id="install-line"');
    expect(src).toMatch(/curl -fsSL https:\/\/app\.loopskill\.io\/api\/bundles\/install\.sh/);
  });

  it('puts the auth-free line BEFORE the MCP line (hero position)', () => {
    const installIdx = src.indexOf('id="install-line"');
    const cloneIdx = src.indexOf('id="clone-line"');
    expect(installIdx).toBeGreaterThan(-1);
    expect(cloneIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeLessThan(cloneIdx);
  });

  it('labels the MCP line as requiring a key, and links to where to get one', () => {
    expect(src).toContain('id="clone-auth-badge"');
    expect(src).toMatch(/requires a free API key/i);
    // The MCP paragraph must point at the keyless alternative, not dead-end.
    expect(src).toMatch(/authenticates every request/i);
  });

  it('no longer claims "No account required" next to the auth-gated MCP line', () => {
    // The exact false sentence that shipped. Its removal is the honesty fix.
    expect(src).not.toMatch(
      /pulls every skill below in a single call\.\s*No account required to install free skills\./,
    );
  });

  it('populates the install line from the API field, with a safe fallback', () => {
    expect(src).toContain('bd.install_command');
    // A stale API build must still render something runnable.
    expect(src).toMatch(/bash -s -- \$\{bd\.slug\}/);
  });

  it('drives the MCP badge from the server flag rather than hardcoded copy', () => {
    expect(src).toContain('bd.clone_line_requires_auth');
  });

  it('wires a copy button for the auth-free line', () => {
    expect(src).toContain('id="copy-install-btn"');
    expect(src).toMatch(/clipboard\.writeText\(installLine\)/);
  });
});
