/**
 * unisearch_0709 / P4 — llms.txt must onboard a CREDENTIAL-LESS agent.
 *
 * Premise, verified live 2026-09-08 against https://app.loopskill.io:
 *   - a keyless POST to the MCP endpoint answers
 *     `401 {"detail":"Invalid or missing x-api-key header"}`, so "MCP,
 *     anonymous" is false and an agent cannot simply start calling tools;
 *   - `POST /api/agents/register` IS public (Ed25519 proof-of-key) and mints a
 *     free-tier `rec_agent_` key with no human in the loop;
 *   - `GET /api/skills/metasearch` and
 *     `GET /api/skills/metasearch/install?install_ref=...` are public.
 *
 * Before P4, llms.txt listed the MCP tools and never mentioned that a key is
 * required or where one comes from — so the primary buyer for this file hit a
 * 401 on its first call and had nothing to read that explained it.
 *
 * This suite pins the pure `coldStartSection()` builder AND the wiring
 * (source-string checks — src/pages/llms.txt.ts is an Astro endpoint exercised
 * at build time, not importable by vitest; convention from
 * mesh0408-t1d-llms-txt-groups.test.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { coldStartSection } from '../src/pages/llms.txt';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = readFileSync(join(ROOT, 'src', 'pages', 'llms.txt.ts'), 'utf8');
const ASSERT_DIST = readFileSync(join(ROOT, 'scripts', 'assert-dist.sh'), 'utf8');

// Verbatim `GET https://app.loopskill.io/.well-known/agent.json`, 2026-09-08.
const LIVE_WELL_KNOWN = {
  "registration": {
    "algorithm": "Ed25519",
    "authentication": "none \u2014 Ed25519 proof-of-key",
    "canonical_string": "loopskill-agent-register:v1:{pubkey}:{timestamp}:{nonce}:{agent_name}",
    "constraints": {
      "active_keys_per_identity": 1,
      "max_clock_skew_seconds": 300,
      "registrations_per_day_global": 20,
      "registrations_per_ip_per_day": 3
    },
    "denies": [
      "checkout",
      "billing",
      "admin",
      "sandbox_run"
    ],
    "endpoint": "https://app.loopskill.io/api/agents/register",
    "errors": {
      "400": [
        "invalid_pubkey",
        "invalid_nonce",
        "invalid_timestamp"
      ],
      "401": [
        "invalid_signature",
        "timestamp_out_of_range",
        "nonce_replayed"
      ],
      "409": [
        "pubkey_already_registered"
      ],
      "429": [
        "ip_registration_limit",
        "global_registration_limit"
      ]
    },
    "grants": [
      "search",
      "install_free_skills",
      "compose_bundles",
      "publish_public_bundles",
      "file_feedback",
      "report_skill_errors",
      "propose_registries"
    ],
    "issues": {
      "header": "x-api-key",
      "key_prefix": "rec_agent_",
      "shown_once": true,
      "tier": "free"
    },
    "method": "POST",
    "request_fields": {
      "agent_name": "display name, <= 64 chars",
      "contact": "optional, <= 128 chars \u2014 NOT part of the signed string",
      "nonce": "LOWERCASE hex, 16-64 bytes, no whitespace; single use, replay is refused",
      "pubkey": "CANONICAL standard base64 of the 32 RAW Ed25519 public key bytes (not PEM/DER) \u2014 padded, zero trailing pad bits, i.e. exactly b64encode(raw); alternate spellings of the same key are refused",
      "signature": "base64 Ed25519 signature over canonical_string",
      "timestamp": "ISO-8601 UTC, within the accepted skew window"
    },
    "signature_encoding": "base64",
    "version": "v1"
  },
  "mcp": {
    "authentication": {
      "header": "x-api-key",
      "type": "api_key"
    },
    "descriptor": "https://app.loopskill.io/.well-known/mcp.json",
    "endpoint": "https://app.loopskill.io/api/mcp/http",
    "transport": "streamable-http"
  },
  "api_base": "https://app.loopskill.io"
};

// The four things a cold agent cannot recover from on its own. assert-dist.sh
// greps dist/llms.txt for exactly these; they are duplicated here so a change
// to either guard fails loudly instead of drifting apart silently.
const COLD_START_TOKENS = [
  'agents/register',
  'loopskill_search',
  'metasearch/install',
  'x-api-key',
];

describe('coldStartSection — grounded in the live /.well-known/agent.json', () => {
  const out = coldStartSection(LIVE_WELL_KNOWN);

  it('teaches all three steps in order: enroll, search, install', () => {
    const enroll = out.indexOf('Step 1');
    const search = out.indexOf('Step 2');
    const install = out.indexOf('Step 3');
    expect(enroll).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(enroll);
    expect(install).toBeGreaterThan(search);
    // Register-FIRST is the whole correction: enrollment must precede the
    // first mention of the MCP endpoint, or the reader tries MCP and 401s.
    expect(enroll).toBeLessThan(out.indexOf('/api/mcp/http'));
  });

  it.each(COLD_START_TOKENS)('names %s', (token) => {
    expect(out).toContain(token);
  });

  it('states the x-api-key requirement AND quotes the 401 an agent will see', () => {
    expect(out).toContain('Invalid or missing x-api-key header');
    expect(out).toContain('401');
  });

  it('derives the canonical signing string from the API, never a local literal', () => {
    expect(out).toContain(LIVE_WELL_KNOWN.registration.canonical_string);
    // The versioned string must not be frozen in the source file: if the API
    // bumps `:v1:`, a hardcoded copy keeps telling agents to sign bytes the
    // server no longer accepts, and signature failures do not degrade
    // gracefully the way a stale count does.
    expect(SRC).not.toContain('loopskill-agent-register:v1:');
  });

  it('derives the enrollment rate limits live — no hardcoded caps', () => {
    const c = LIVE_WELL_KNOWN.registration.constraints;
    expect(out).toContain(String(c.registrations_per_ip_per_day));
    expect(out).toContain(String(c.max_clock_skew_seconds));
    expect(out).toContain('registrations per ip per day');
    expect(SRC).not.toContain('registrations per day');
  });

  it('publishes the free-tier grants and denies from the API, not a guess', () => {
    for (const g of LIVE_WELL_KNOWN.registration.grants) expect(out).toContain(g);
    for (const d of LIVE_WELL_KNOWN.registration.denies) expect(out).toContain(d);
  });

  it('points at the trailing-slash MCP URL (the published one 307s on POST)', () => {
    expect(out).toContain('https://app.loopskill.io/api/mcp/http/');
    expect(out).toContain('307');
  });

  it('carries install_ref through search into install as one identifier', () => {
    expect(out).toContain('install_ref');
    expect(out).toContain('install_ref=<install_ref>');
  });

  it('is honest about deep-link rows instead of promising a fake install', () => {
    expect(out).toContain('deep_link');
    expect(out).toContain('deployable');
    expect(out).toMatch(/not an install failure|pointer, not a package/);
  });
});

describe('coldStartSection — honest degradation when /.well-known is unreachable', () => {
  const out = coldStartSection(null);

  it.each(COLD_START_TOKENS)('still names %s with no API data', (token) => {
    expect(out).toContain(token);
  });

  it('still states the x-api-key header requirement', () => {
    // This is the one detail with no fallback path: an agent that does not
    // know the header name cannot discover it from a 401 alone.
    expect(out).toContain('x-api-key');
  });

  it('points at /.well-known rather than inventing a signing string', () => {
    expect(out).toContain('/.well-known/agent.json');
    expect(out).toContain('registration.canonical_string');
    expect(out).not.toContain('loopskill-agent-register');
  });

  it('claims no rate-limit numbers it did not fetch', () => {
    expect(out).not.toMatch(/registrations per ip per day: \d/);
  });
});

describe('llms.txt.ts wiring', () => {
  it('fetches the agent-discovery document at build time, unauthenticated', () => {
    expect(SRC).toContain("fetchApi<WellKnownAgent>('/.well-known/agent.json', { authed: false })");
  });

  it('renders the cold-start section into the body unconditionally', () => {
    expect(SRC).toContain('const coldStart = coldStartSection(agentRes.data);');
    expect(SRC).toContain('${coldStart}');
  });
});

describe('assert-dist.sh guards the emitted llms.txt', () => {
  it.each(COLD_START_TOKENS)('fails the build when dist/llms.txt loses %s', (token) => {
    expect(ASSERT_DIST).toContain(token);
  });

  it('greps the built artifact, not the source', () => {
    expect(ASSERT_DIST).toContain('llms_path="$DIST_DIR/llms.txt"');
    expect(ASSERT_DIST).toContain('COLD_START_TOKENS');
  });
});
