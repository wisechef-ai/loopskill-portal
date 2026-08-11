/**
 * doc-command-extract — pure, network-free extraction of EXECUTABLE HTTP
 * commands from LoopSkill's own documentation surfaces.
 *
 * WHY THIS FILE EXISTS (bundles_0811 P0 gate, premortem risk #2)
 * ----------------------------------------------------------------
 * "Docs get fixed once and re-rot — exactly how #215/#216 happened.
 * Mitigation: the P0 gate is a CI job that EXECUTES the documented
 * commands; a reviewed doc rots, a tested doc cannot."
 *
 * PR #51 (866436c) fixed the TEXT of the docs and locked it with a static
 * grep test (tests/mcp-docs-consolidation-215-216-217-218-219.test.ts). That
 * test asserts strings are present/absent — it never executes a single
 * documented command, so a future edit could reintroduce a broken command
 * (wrong param name, dead path, stale slug) and the grep test would stay
 * green. This module is the sibling that closes that gap: it EXTRACTS every
 * copy-pasteable command from the doc sources (never a hand-maintained
 * list — a hand list re-rots exactly like the docs did) so the caller can
 * execute each one for real and fail the build on a bad status.
 *
 * SCOPE DECISION (documented here because it is a real methodological
 * choice, not an oversight): we extract two classes of "documented command":
 *
 *   1. llms.txt — every single-backtick `GET <url>` / `POST <url>` line,
 *      plus every `curl -X POST <url>` line in the per-loop bullets. This is
 *      llms.txt's OWN convention for a machine-readable command (the whole
 *      point of llms.txt is that an agent parses exactly this shape).
 *
 *   2. docs/*.astro — every `<pre><code>...curl ...</code></pre>` block.
 *      These are the copy-pasteable examples a human or agent would
 *      literally paste into a terminal. Bare inline `<code>GET /api/...
 *      </code>` mentions inside descriptive prose (e.g. how-it-works.astro's
 *      "Agent calls GET /api/skills/search...") are NOT extracted — they are
 *      illustrative flow-diagram text describing what happens under the
 *      hood, not a command the page is telling the reader to run verbatim.
 *      Every doc page in this repo consistently uses <pre><code>curl for
 *      real runnable examples and inline <code> for descriptive mentions,
 *      so this split tracks the docs' own convention rather than inventing
 *      one.
 *
 * A THIRD, explicit hand-written rule exists for exactly one case:
 * /openapi.json. api-reference.astro states in prose (not a curl block)
 * that this endpoint "returns 404 and always did." That is a deliberately
 * documented NON-2xx contract, not an omission — extractOpenApiDeadLink()
 * exists to keep that assertion live instead of letting a real fix silently
 * go undetected (or a regression silently pass).
 */

export type DocCommandMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface DocCommand {
  method: DocCommandMethod;
  /** Fully resolved URL as written in the doc (may still carry a header hint). */
  url: string;
  /** Human label for CI failure messages, e.g. "loops per-bullet run command". */
  label: string;
  /** Where this command was found — file path or "llms.txt" (live-rendered). */
  source: string;
  /** True when the concrete example shows an `x-api-key` header being sent. */
  hasAuthHeader: boolean;
}

const URL_CHARS = String.raw`[^\s"'\u0060<>]+`; // \u0060 = backtick

/**
 * Extract `` `GET <url>` `` / `` `POST <url>` `` backtick-wrapped command
 * lines from llms.txt content. Only fully-concrete URLs are returned
 * (no `{slug}` / `<query>` / `<comma-separated>` template placeholders) —
 * those are prose describing the endpoint SHAPE, not a runnable command.
 * The concrete instance of the same endpoint (a real slug) is what gets
 * extracted from the per-loop / per-bundle bullet lines below it.
 */
export function extractLlmsTxtBacktickCommands(llmsTxt: string): DocCommand[] {
  const out: DocCommand[] = [];
  const re = new RegExp('`(GET|POST)\\s+(' + URL_CHARS + ')`', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(llmsTxt))) {
    const [, method, rawUrl] = m;
    if (/[{}<>]/.test(rawUrl)) continue; // template placeholder — not executable
    out.push({
      method: method as DocCommandMethod,
      url: rawUrl,
      label: `llms.txt backtick command: ${method} ${rawUrl}`,
      source: 'llms.txt',
      hasAuthHeader: false,
    });
  }
  return out;
}

/**
 * Extract `curl -X POST <url>` "Run it" lines from llms.txt's per-loop
 * bullets. These carry REAL loop slugs (not templates) and are the concrete
 * instance of the templated `POST .../api/loops/{slug}/run` line above them.
 */
export function extractLlmsTxtCurlRunCommands(llmsTxt: string): DocCommand[] {
  const out: DocCommand[] = [];
  const re = new RegExp('curl -X POST (' + URL_CHARS + ')', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(llmsTxt))) {
    const url = m[1].replace(/[`'".,]+$/, '');
    out.push({
      method: 'POST',
      url,
      label: `llms.txt loop "Run it" command: ${url}`,
      source: 'llms.txt',
      hasAuthHeader: false,
    });
  }
  return out;
}

/**
 * Extract every `<pre><code>...curl ...</code></pre>` block's command(s)
 * from a docs/*.astro source file's raw text. Handles the two encodings the
 * repo uses for a literal `{` inside JSX (`&#123;` and a template-literal
 * `{\`...\`}` block) by treating both as opaque before regexing for `curl`.
 */
export function extractAstroCurlBlocks(fileText: string, sourceLabel: string): DocCommand[] {
  const out: DocCommand[] = [];
  const blockRe = /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g;
  let block: RegExpExecArray | null;
  let blockIndex = 0;
  while ((block = blockRe.exec(fileText))) {
    blockIndex += 1;
    const raw = block[1];
    if (!/\bcurl\b/.test(raw)) continue;
    // Join backslash line-continuations so a multi-line curl becomes one
    // scannable string (matches how a human would actually run it).
    const joined = raw.replace(/\\\s*\n\s*/g, ' ').replace(/\n/g, ' ');
    // Split into one substring per `curl` invocation — deliberately loose
    // (rather than a single strict curl-arg-parsing regex) because these
    // doc examples routinely embed intentionally-broken placeholder header
    // values (`"x-api-key: *** ` with no closing quote, to avoid printing a
    // real-looking secret) that would defeat a quote-balanced parser. A
    // command's URL and method are unambiguous even when its flags aren't
    // perfectly quoted, so we extract those two facts directly instead of
    // fully parsing the shell line.
    const invocationStarts: number[] = [];
    const curlRe = /\bcurl\b/g;
    let cm: RegExpExecArray | null;
    while ((cm = curlRe.exec(joined))) invocationStarts.push(cm.index);
    for (let i = 0; i < invocationStarts.length; i++) {
      const start = invocationStarts[i];
      const end = i + 1 < invocationStarts.length ? invocationStarts[i + 1] : joined.length;
      const invocation = joined.slice(start, end);

      const urlMatch = invocation.match(/https:\/\/[^\s"'\u0060]+/);
      if (!urlMatch) continue; // e.g. "curl works too" prose heading, no URL in this slice
      const url = urlMatch[0].replace(/[`'".,)]+$/, '');

      const explicitMethod = invocation.match(/-X\s+(GET|POST|PUT|DELETE)\b/i);
      // curl defaults to POST when -d/--data is present without an explicit -X.
      const hasDataFlag = /(^|\s)(-d|--data(-raw|-binary)?)\s/.test(invocation);
      const method = (explicitMethod
        ? (explicitMethod[1].toUpperCase() as DocCommandMethod)
        : hasDataFlag
          ? 'POST'
          : 'GET');

      const hasAuthHeader = /x-api-key/i.test(invocation);
      out.push({
        method,
        url,
        label: `${sourceLabel} curl block #${blockIndex}${invocationStarts.length > 1 ? `.${i + 1}` : ''}: ${method} ${url}`,
        source: sourceLabel,
        hasAuthHeader,
      });
    }
  }
  return out;
}

/**
 * Extract `curl -sL <url> -o <path>` meta-skill download commands — a
 * distinct pattern from the API curl blocks above (target is a raw file
 * download, not a JSON endpoint, and the URL sits mid-command rather than
 * at the end). Used by getting-started.astro, install.astro, new-agent.astro,
 * vscode.astro, index.astro, and deployment.astro.
 */
export function extractAstroDownloadCommands(fileText: string, sourceLabel: string): DocCommand[] {
  const out: DocCommand[] = [];
  const re = /curl\s+(?:-\w+\s+)*?(https:\/\/[^\s"'\u0060]+)\s+(?:\\\s*)?-o\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileText))) {
    const url = m[1].replace(/[`'".,]+$/, '');
    out.push({
      method: 'GET',
      url,
      label: `${sourceLabel}: meta-skill download command: GET ${url}`,
      source: sourceLabel,
      hasAuthHeader: false,
    });
  }
  return out;
}

/** Dedupe by method+url, keeping the first occurrence's metadata. */
export function dedupeCommands(cmds: DocCommand[]): DocCommand[] {
  const seen = new Map<string, DocCommand>();
  for (const c of cmds) {
    const key = `${c.method} ${c.url}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

/**
 * The one hand-written extraction rule in this module: api-reference.astro
 * states in PROSE (not a curl block) that /openapi.json deliberately 404s.
 * Kept as its own tiny function — rather than folded silently into the
 * generic scanners — precisely so a reviewer can see this is a conscious
 * "assert the documented non-2xx" case, matching the same discipline the
 * task asks for on 401-gated auth endpoints.
 */
export function extractOpenApiDeadLinkClaim(fileText: string): DocCommand | null {
  if (!/\/openapi\.json[\s\S]{0,120}returns[\s\S]{0,20}404[\s\S]{0,20}and\s+always\s+did/i.test(fileText)) {
    return null;
  }
  return {
    method: 'GET',
    url: 'https://app.loopskill.io/openapi.json',
    label: 'api-reference.astro: documented dead link /openapi.json (must stay 404)',
    source: 'docs/api-reference.astro',
    hasAuthHeader: false,
  };
}
