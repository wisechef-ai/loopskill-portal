/**
 * AuditBars — 4 horizontal progress bars for skill quality dimensions.
 * (Phase Q: React island version of AuditRow.astro)
 *
 * Teaching note: Props come from the parent .astro page which already
 * fetches the skill data server-side. We just render what we're given.
 * No fetch needed here — the data is passed as HTML attributes via Astro.
 *
 * The 4 dimensions and how they're scored:
 *   security  → quality_score (0-1 from API)
 *   docs      → has readme + description
 *   tests     → unhappy_paths count from readme
 *   freshness → days since last_verified (recent = 100%)
 */

interface AuditBarsProps {
  /** 0–1 float from API, or null if not yet computed */
  qualityScore?: number | null;
  /** Whether a readme exists */
  hasReadme?: boolean;
  /** Number of unhappy-paths documented in the skill */
  unhappyPaths?: number;
  /** ISO-8601 date of last review */
  lastVerifiedAt?: string | null;
  /** Source URL present = audited externally */
  sourceUrl?: string | null;
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

/** Convert quality_score (0-1) to a 0-100 security percentage */
function securityPct(qualityScore: number | null | undefined): number {
  if (qualityScore === null || qualityScore === undefined) return 0;
  return Math.round(Math.min(100, Math.max(0, qualityScore * 100)));
}

/**
 * Docs score: 50 pts for having a readme, +50 if description is rich
 * (We only see `hasReadme` here — the description is not passed in,
 * so cap docs at 50 when readme exists but we can't inspect depth.)
 */
function docsPct(hasReadme: boolean | undefined): number {
  if (!hasReadme) return 10; // no readme = very low
  return 70; // readme exists — treat as solid docs without deeper inspection
}

/**
 * Tests proxy: each unhappy-path paragraph = ~10% of a 100% score.
 * Cap at 10 (=100%).
 */
function testsPct(unhappyPaths: number | undefined): number {
  const n = unhappyPaths ?? 0;
  return Math.min(100, n * 10);
}

/**
 * Freshness score: 100% if reviewed within 30d, degrades linearly to 0% at 365d.
 */
function freshnessPct(lastVerifiedAt: string | null | undefined): number {
  if (!lastVerifiedAt) return 0;
  try {
    const d = new Date(lastVerifiedAt);
    if (Number.isNaN(d.getTime())) return 0;
    const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(100 - (ageDays / 365) * 100));
  } catch {
    return 0;
  }
}

// ─── Bar component ────────────────────────────────────────────────────────────

function AuditBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted uppercase tracking-wider font-semibold">{label}</span>
        <span className="text-muted-soft tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-1.5 rounded-full bg-bg-elev overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} score: ${pct}%`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AuditBars({
  qualityScore,
  hasReadme,
  unhappyPaths,
  lastVerifiedAt,
  sourceUrl,
}: AuditBarsProps) {
  const sec = securityPct(qualityScore);
  const docs = docsPct(hasReadme);
  const tests = testsPct(unhappyPaths);
  const freshness = freshnessPct(lastVerifiedAt);

  // first-impression fix (4): the OLD gate below (`sec===0 && docs===10 &&
  // tests===0 && freshness===0`) only fired when a skill had NO readme at
  // all — but most published skills DO have a readme (docsPct returns 70),
  // so for the common case of "audit never run" (qualityScore=null,
  // unhappyPaths=0, lastVerifiedAt=null) the gate stayed false and the
  // widget rendered three literal "0%" bars — verified live on
  // /skills/super-memory: "Security 0% / Tests 0% / Freshness 0%" for a
  // skill that has simply never been scored, indistinguishable from a skill
  // that scored an actual zero on a real audit.
  //
  // Fix: audit-unrun is a property of the three AUDIT-DERIVED signals
  // (security/tests/freshness) — docs is a readme-presence check, not part
  // of the audit, so it must not gate this message. Render "Not yet
  // audited" whenever none of the three real signals has ever been
  // populated, regardless of readme presence.
  const neverAudited =
    (qualityScore === null || qualityScore === undefined) &&
    !unhappyPaths &&
    !lastVerifiedAt;
  if (neverAudited) {
    return (
      <p className="text-xs text-muted-soft">
        Not yet audited.{' '}
        <a href="/security" className="text-accent hover:underline">
          How we audit →
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <AuditBar label="Security" pct={sec} color="var(--color-success)" />
      <AuditBar label="Docs" pct={docs} color="var(--color-accent)" />
      <AuditBar label="Tests" pct={tests} color="#818cf8" />
      <AuditBar label="Freshness" pct={freshness} color="#fb923c" />
      {sourceUrl && (
        <p className="text-[10px] text-muted-soft mt-1">
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block">
            ↗ Source audited
          </a>
        </p>
      )}
    </div>
  );
}
