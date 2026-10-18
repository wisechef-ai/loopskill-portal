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
 *   - fetch_origin  -> the registry really can serve the body; the text is a
 *                      fresh-agent phrase (qa1018) naming the raw install_ref.
 *   - deep_link     -> NOTHING to copy; the card links out ("Get it from
 *                      source ↗") instead (qa1018 C09).
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

/**
 * qa1018 (launch QA, 5/5 personas): the bootstrap phrase a FRESH agent can act on.
 * One string, shown == copied, everywhere (home, InstallWidget, docs, skill and
 * bundle pages). Full https URL, no trailing words. Free skills need NO key —
 * the phrase must never carry a key placeholder.
 */
export const META_INSTALL_PHRASE = `Install the loopskill skill from ${LOOPSKILL_ORIGIN}/skill`;

/** Phrase for one artifact that works from a fresh agent (bootstrap + target). */
export function freshAgentPhrase(kind: 'skill' | 'bundle', slug: string): string {
  return `${META_INSTALL_PHRASE}, then use it to install the "${slug}" ${kind}.`;
}

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
 * qa1018 C09: phrase for a loop / personality from a FRESH agent. Same
 * bootstrap as freshAgentPhrase; the verb is "load" because a loop or a
 * personality is fetched and run, not unpacked into a skills directory.
 */
export function freshAgentLoadPhrase(kind: 'loop' | 'personality', slug: string): string {
  return `${META_INSTALL_PHRASE}, then use it to load the "${slug}" ${kind}.`;
}

/**
 * The agent-shaped install text for one card. Returns '' when there is
 * nothing honest to COPY — no identity at all, or a deep-link federated row
 * that LoopSkill cannot redistribute. The caller then renders no copy button;
 * for deep-link rows it renders agentSourceUrl() as a "Get it from source ↗"
 * link instead (qa1018 C09: a button that says "Copied ✓" over a refusal
 * sentence is a lie the visitor only discovers after pasting it).
 *
 * qa1018 C09: every copyable string is a FRESH-AGENT phrase (bootstrap the
 * loopskill skill, then name the target). The old MCP-call strings
 * ("call loopskill_install(...)") only worked in an agent that already had
 * LoopSkill connected with an API key — a first-time visitor's agent has no
 * such tool. No key placeholder, no "please", shown == copied.
 */
export function agentInstallText(type: AgentArtifactType | string, item: AgentInstallSubject | null | undefined): string {
  if (!item) return '';
  const slug = item.slug ? String(item.slug).trim() : '';

  if (isFederatedSubject(item)) {
    // Raw ref, NOT the lowercased canonical key — the agent has to send this
    // back to the API verbatim.
    const ref = String(item.install_ref || '').trim() || canonicalInstallRef(item);
    if (federatedInstallPath(item) === 'fetch_origin') return freshAgentPhrase('skill', ref);
    return ''; // deep_link: never copyable — see agentSourceUrl()
  }

  if (!slug) return '';
  const t = String(type || '');
  if (t === 'bundle' || t === 'bundles') return freshAgentPhrase('bundle', slug);
  if (t === 'loop' || t === 'loops') return freshAgentLoadPhrase('loop', slug);
  if (t === 'personality' || t === 'personalities') return freshAgentLoadPhrase('personality', slug);
  return freshAgentPhrase('skill', slug);
}

/**
 * Where a NON-installable (deep-link) federated row actually lives. '' for
 * anything installable, local, or without a real http(s) origin_url (the URL
 * is upstream-controlled — a javascript: value never becomes a link).
 */
export function agentSourceUrl(item: AgentInstallSubject | null | undefined): string {
  if (!item || !isFederatedSubject(item)) return '';
  if (federatedInstallPath(item) === 'fetch_origin') return '';
  return isHttpUrl(item.origin_url) ? String(item.origin_url) : '';
}

/**
 * qa1018 C07: a short "owner/repo" (or host) label for a federated row, so
 * five cards all titled "seo" can be told apart. Derived from origin_url
 * (github.com/<owner>/<repo>, skills.sh/<owner>/<repo>/…, clawhub.ai/<owner>/…)
 * or, failing that, the "Indexed by skills.sh from <owner>/<repo>" stub
 * description. '' when nothing trustworthy is available.
 */
export function sourceOwnerRepo(item: { origin_url?: string | null; description?: string | null } | null | undefined): string {
  if (!item) return '';
  const u = item.origin_url;
  if (isHttpUrl(u)) {
    try {
      const url = new URL(u);
      const host = url.hostname.replace(/^www\./, '');
      const parts = url.pathname.split('/').filter(Boolean);
      if ((host === 'github.com' || host === 'skills.sh') && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
      if (host === 'clawhub.ai' && parts.length >= 1) return `${parts[0]} · clawhub`;
      return parts.length ? `${host}/${parts[0]}` : host;
    } catch { /* fall through to the description */ }
  }
  const m = String(item.description || '').match(/from ([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  return m ? m[1] : '';
}

/** The visible label. Pinned by scripts/assert-dist.sh and by the DoD grep. */
export const COPY_FOR_AGENT_LABEL = 'Copy for agent';
export const COPY_FOR_AGENT_DONE = 'Copied ✓';
/** qa1018 C09: label for deep-link (non-redistributable) rows. */
export const SOURCE_LINK_LABEL = 'Get it from source ↗';

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
  const name = displayTitle((item || {}) as AgentInstallSubject);
  if (!text) {
    // qa1018 C09: deep-link rows get a plain outbound link, never a copy
    // button. Class .artifact-source (NOT .artifact-copy) so the delegated
    // copy controller never preventDefault()s the navigation.
    const src = agentSourceUrl(item);
    if (!src) return '';
    return `<a class="artifact-source" href="${esc(src)}" target="_blank" rel="noopener nofollow"`
      + ` aria-label="${esc(SOURCE_LINK_LABEL)}: ${esc(name)} is not hosted by LoopSkill (opens its source)">`
      + `${esc(SOURCE_LINK_LABEL)}</a>`;
  }
  return `<button type="button" class="artifact-copy" data-copy-text="${esc(text)}"`
    + ` title="${esc(text)}"`
    + ` aria-label="${esc(COPY_FOR_AGENT_LABEL)}: copy the install phrase for ${esc(name)} to paste into your agent's chat">`
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
