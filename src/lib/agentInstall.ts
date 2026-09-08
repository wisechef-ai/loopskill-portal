/**
 * agentInstall.ts — "Copy for agent" (unisearch_0709 / P3).
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Discovery and install were disconnected. A visitor could find a federated
 * skill on /browse and had no way to hand it to an agent: the only copy
 * affordance on the whole site was `#copy-install-btn` on
 * /skills/external/view, and it copied a SHELL COMMAND — something a human
 * pastes into a terminal, not something an agent can act on. There was no
 * "Copy for agent" anywhere in the repo.
 *
 * THE ONE FORMAT
 * --------------
 * This module is the SINGLE source of the agent-shaped text. Every surface
 * that offers "Copy for agent" renders the string this module builds, so a
 * federated card on /browse and the viewer page for the same skill hand an
 * agent byte-identical instructions.
 *
 * HONESTY CONTRACT (sprint locked decision #4: deep-link rows are NEVER
 * deployable and never get a fake install button)
 *   - fetch_origin  -> the registry really can serve the body; the text names
 *                      the MCP tool AND the plain HTTP fallback.
 *   - deep_link     -> the text says so, and says where to actually get it.
 *   - unknown shape -> FAILS CLOSED to deep_link. We never promise an install
 *                      path we have not been told exists.
 *
 * TWO API PIPELINES, ONE VERDICT
 * ------------------------------
 * The federated rows on /browse arrive from two endpoints with two different
 * spellings of the same fact (verified live 2026-09-08):
 *   GET /api/search        federated[] -> { install_ref, deployable }        (no install_path)
 *   GET /api/skills/external external[] -> { install_ref, install_path, redistributable }
 * `federatedInstallPath()` reconciles them. `install_path` wins when present
 * because it is the endpoint's own verdict; `deployable` is only consulted
 * when there is no `install_path` at all.
 *
 * DUPLICATION NOTE (same situation as likeControl.ts / federatedCounts.ts):
 * browse.astro and skills/external/view.astro both carry `define:vars`
 * scripts, which Astro forces to `is:inline` — ESM imports are UNAVAILABLE
 * there, so those two files mirror `agentInstallText()` inline. THIS FILE IS
 * CANONICAL and is unit-tested (tests/unisearch-0709-agent-install.test.ts
 * pins the two mirrors against it). Change the text here first.
 */

/** The canonical public origin. Also asserted by scripts/assert-dist.sh. */
export const LOOPSKILL_ORIGIN = 'https://app.loopskill.io';

export type AgentArtifactType =
  | 'skill' | 'skills'
  | 'loop' | 'loops'
  | 'bundle' | 'bundles'
  | 'personality' | 'personalities';

export interface AgentInstallSubject {
  slug?: string | null;
  title?: string | null;
  /** Federated identity, canonical form "source:slug" (legacy "source--slug" accepted). */
  install_ref?: string | null;
  /** 'fetch_origin' | 'deep_link' — GET /api/skills/external's own verdict. */
  install_path?: string | null;
  /** GET /api/search's spelling of the same fact. Only used when install_path is absent. */
  deployable?: boolean | null;
  origin_url?: string | null;
  source?: string | null;
}

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c],
  );
}

function isHttpUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

/**
 * The dedupe key for a federated row: lowercased "source:slug".
 *
 * NEVER use this in copy text — it is lowercased and therefore lossy. The
 * install_ref an agent is handed must be the raw one the API emitted.
 */
export function canonicalInstallRef(row: AgentInstallSubject | null | undefined): string {
  if (!row) return '';
  let ref = row.install_ref ? String(row.install_ref).trim() : '';
  if (!ref) {
    const src = row.source ? String(row.source).trim() : '';
    const slug = row.slug ? String(row.slug).trim() : '';
    if (!slug) return '';
    ref = src ? `${src}:${slug}` : slug;
  }
  if (ref.indexOf(':') === -1) {
    // Legacy "source--slug" form — split on the FIRST double-dash only, a
    // slug may itself legitimately contain "--".
    const d = ref.indexOf('--');
    if (d > 0) ref = `${ref.slice(0, d)}:${ref.slice(d + 2)}`;
  }
  return ref.toLowerCase();
}

/** True when this row belongs to the federated index rather than the local catalog. */
export function isFederatedSubject(row: AgentInstallSubject | null | undefined): boolean {
  return canonicalInstallRef(row).indexOf(':') > 0;
}

/**
 * The install verdict for a federated row. FAILS CLOSED: anything we were not
 * explicitly told is fetchable is treated as deep_link.
 */
export function federatedInstallPath(row: AgentInstallSubject | null | undefined): 'fetch_origin' | 'deep_link' {
  if (!row) return 'deep_link';
  if (row.install_path === 'fetch_origin') return 'fetch_origin';
  if (row.install_path === 'deep_link') return 'deep_link';
  if (row.install_path) return 'deep_link'; // unknown future value — fail closed
  return row.deployable === true ? 'fetch_origin' : 'deep_link';
}

function displayTitle(row: AgentInstallSubject): string {
  const t = row.title ? String(row.title).trim() : '';
  if (t) return t;
  const s = row.slug ? String(row.slug).trim() : '';
  return s || 'This skill';
}

/**
 * The agent-shaped install text for one card. Returns '' when there is
 * nothing honest to say (no slug and no install_ref) — the caller then
 * renders no button at all rather than a button that copies nothing.
 */
export function agentInstallText(type: AgentArtifactType | string, item: AgentInstallSubject | null | undefined): string {
  if (!item) return '';
  const title = displayTitle(item);
  const slug = item.slug ? String(item.slug).trim() : '';

  if (isFederatedSubject(item)) {
    // Raw ref, NOT the lowercased canonical key — the agent has to send this
    // back to the API verbatim.
    const ref = String(item.install_ref || '').trim() || canonicalInstallRef(item);
    if (federatedInstallPath(item) === 'fetch_origin') {
      return `Install "${title}" from LoopSkill: call loopskill_install("${ref}") — or GET ${LOOPSKILL_ORIGIN}/api/skills/metasearch/install?install_ref=${ref}, then extract it to your skills directory.`;
    }
    if (isHttpUrl(item.origin_url)) {
      return `"${title}" isn't redistributable through the registry (source license). Get it from ${item.origin_url}.`;
    }
    const src = item.source ? String(item.source).trim() : '';
    return src
      ? `"${title}" isn't redistributable through the registry (source license). Get it from its origin registry, ${src}.`
      : `"${title}" isn't redistributable through the registry (source license). Get it from its origin — LoopSkill does not rehost it.`;
  }

  if (!slug) return '';
  const t = String(type || '');

  // Local catalog. These are NOT federated rows: /api/skills/metasearch/install
  // does not resolve a bare local slug (probed 2026-09-08: 404 malformed_ref),
  // so quoting the metasearch URL here would be a lie. Each type names the MCP
  // tool that actually installs it.
  if (t === 'bundle' || t === 'bundles') {
    return `Install the "${title}" bundle from LoopSkill: call loopskill_bundle_install("${slug}").`;
  }
  if (t === 'loop' || t === 'loops') {
    return `Load the "${title}" loop from LoopSkill: call loopskill_get_loop("${slug}").`;
  }
  if (t === 'personality' || t === 'personalities') {
    return `Load the "${title}" personality from LoopSkill: call loopskill_get_personality("${slug}").`;
  }
  return `Install "${title}" from LoopSkill: call loopskill_install("${slug}") — or GET ${LOOPSKILL_ORIGIN}/api/skills/${slug}/install with your x-api-key header, then extract it to your skills directory.`;
}

/** The visible label. Pinned by scripts/assert-dist.sh and by the DoD grep. */
export const COPY_FOR_AGENT_LABEL = 'Copy for agent';
export const COPY_FOR_AGENT_DONE = 'Copied ✓';

/**
 * The button markup. It is a SIBLING of the card <a> inside .artifact-slot,
 * never a descendant — a <button> nested in an <a> is invalid HTML and breaks
 * keyboard activation in every browser (the same constraint .artifact-like
 * already documents).
 *
 * Hover-revealed via CSS, but NEVER display:none/visibility:hidden: the slot's
 * :focus-within and the button's own :focus-visible both reveal it, so it
 * stays in the tab order. A mouse-only affordance here would be an
 * accessibility regression, not a nicety.
 */
export function copyForAgentHTML(type: AgentArtifactType | string, item: AgentInstallSubject | null | undefined): string {
  const text = agentInstallText(type, item);
  if (!text) return '';
  const name = displayTitle(item as AgentInstallSubject);
  return `<button type="button" class="artifact-copy" data-copy-text="${esc(text)}"`
    + ` title="${esc(COPY_FOR_AGENT_LABEL)}"`
    + ` aria-label="${esc(COPY_FOR_AGENT_LABEL)}: copy install instructions for ${esc(name)}">`
    + `<span class="artifact-copy-label" aria-live="polite">${esc(COPY_FOR_AGENT_LABEL)}</span></button>`;
}

/**
 * Put `text` on the clipboard. Returns 'clipboard' | 'exec' on success and
 * 'manual' when neither transport is available — the caller MUST then expose
 * the text for manual selection. A silent no-op is not an acceptable
 * degradation: the user pressed a button that says it copied something.
 */
export async function writeClipboard(text: string, doc: Document = document): Promise<'clipboard' | 'exec' | 'manual'> {
  const nav = (doc.defaultView || (globalThis as any)).navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      /* insecure context / permission denied — fall through to execCommand */
    }
  }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    const ok = typeof (doc as any).execCommand === 'function' && (doc as any).execCommand('copy');
    doc.body.removeChild(ta);
    if (ok) return 'exec';
  } catch {
    /* execCommand unavailable/blocked — fall through to the manual affordance */
  }
  return 'manual';
}

/**
 * Reveal the text for manual selection, next to the button that failed. This
 * is the honest degradation path — the visitor can still get the string.
 */
export function showManualCopyFallback(btn: HTMLElement, text: string): void {
  const slot = (btn.closest && (btn.closest('.artifact-slot') as HTMLElement)) || btn.parentElement;
  if (!slot) return;
  let ta = slot.querySelector('.artifact-copy-fallback') as HTMLTextAreaElement | null;
  if (!ta) {
    ta = btn.ownerDocument.createElement('textarea');
    ta.className = 'artifact-copy-fallback';
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-label', 'Install instructions — select and copy manually');
    slot.appendChild(ta);
  }
  ta.value = text;
  ta.hidden = false;
  try { ta.focus(); ta.select(); } catch { /* focus can throw in detached DOM */ }
}

/**
 * Delegated click handling for every .artifact-copy on the page. Delegated so
 * it survives the innerHTML re-renders that Home shelves and Browse results
 * both do (same contract as createLikeController).
 */
export function createCopyForAgentController(opts: { root?: Document } = {}) {
  const doc = opts.root || document;
  async function onClick(ev: Event) {
    const target = ev.target as HTMLElement | null;
    const btn = target && target.closest ? (target.closest('.artifact-copy') as HTMLElement | null) : null;
    if (!btn) return;
    // The button sits inside .artifact-slot next to the card <a>; stop the
    // event so copying never navigates.
    ev.preventDefault();
    ev.stopPropagation();
    const text = btn.getAttribute('data-copy-text') || '';
    if (!text) return;
    const label = (btn.querySelector('.artifact-copy-label') as HTMLElement | null) || btn;
    const how = await writeClipboard(text, doc);
    if (how === 'manual') {
      label.textContent = 'Select & copy';
      btn.setAttribute('data-copied', 'true');
      showManualCopyFallback(btn, text);
      return;
    }
    label.textContent = COPY_FOR_AGENT_DONE;
    btn.setAttribute('data-copied', 'true');
    setTimeout(() => {
      label.textContent = COPY_FOR_AGENT_LABEL;
      btn.removeAttribute('data-copied');
    }, 1800);
  }
  doc.addEventListener('click', onClick);
  return { destroy() { doc.removeEventListener('click', onClick); } };
}
