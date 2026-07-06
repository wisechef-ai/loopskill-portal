// identicon.ts — deterministic GitHub-avatar-family identicon SVG for any slug.
//
// Adam (2026-07-06): tiles were "static color + one letter — not cool"; picked
// identicon-style geometric blocks. Constraints honored:
//   - SUPER SCALABLE: pure hash → SVG string. Zero storage, zero network,
//     works for 84k+ federated skills that appear dynamically at search time.
//   - DETERMINISTIC: same slug renders the same art on every surface (browse,
//     shelves, library, bundle detail, fleet map side panel).
//   - 5×5 grid mirrored on the vertical axis (the GitHub identicon shape
//     grammar) on the card's own gradient; cells carry two alpha levels so
//     tiles read as layered, not flat.
//
// Both renderers consume this: artifactCard.ts (client-side shelves/browse)
// and SkillCover.astro (build-time covers). Keep it dependency-free.

export function identiconHash(s: string): number[] {
  // xorshift-mixed rolling hash → 16 bytes of stable pseudo-randomness.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = ((h1 ^ s.charCodeAt(i)) * 0x01000193) >>> 0;
    h2 = ((h2 * 31 + s.charCodeAt(i)) ^ (h2 >>> 7)) >>> 0;
  }
  const bytes: number[] = [];
  let x = h1 || 1;
  let y = h2 || 2;
  for (let i = 0; i < 16; i++) {
    // xorshift32 steps interleaved from both seeds
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    y ^= y << 7; y >>>= 0; y ^= y >> 9; y ^= y << 8; y >>>= 0;
    bytes.push(((x ^ y) >>> (i % 3)) & 0xff);
  }
  return bytes;
}

/**
 * 5×5 mirrored identicon as SVG inner markup (rects only, no outer <svg>).
 * Renders on top of the card gradient: cells are white at two alpha levels.
 * viewBox is 0 0 100 100; cell = 20 units.
 */
export function identiconRects(slug: string): string {
  const b = identiconHash(slug || 'loopskill');
  const rects: string[] = [];
  // 15 decision cells: 3 columns × 5 rows, mirrored to columns 3,4.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const byte = b[row * 3 + col];
      const on = byte % 2 === 0; // ~50% fill like GitHub
      if (!on) continue;
      const strong = byte % 4 === 0; // half the filled cells pop brighter
      const opacity = strong ? 0.5 : 0.28;
      const x = col * 20;
      const y = row * 20;
      rects.push(`<rect x="${x}" y="${y}" width="20" height="20" fill="#fff" fill-opacity="${opacity}"/>`);
      if (col < 2) {
        const mx = (4 - col) * 20;
        rects.push(`<rect x="${mx}" y="${y}" width="20" height="20" fill="#fff" fill-opacity="${opacity}"/>`);
      }
    }
  }
  return rects.join('');
}

/** Full standalone identicon SVG string (for client-side innerHTML use). */
export function identiconSVG(slug: string, extraClass = ''): string {
  return `<svg class="${extraClass}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;">${identiconRects(slug)}</svg>`;
}
