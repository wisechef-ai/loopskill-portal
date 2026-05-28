/**
 * RuntimePanel — right-rail component for the skill detail page (Phase Q).
 *
 * Fetches two endpoints in parallel:
 *   /api/skills/{slug}/runtime       → runtimes, tools, frontmatter
 *   /api/skills/{slug}/install-events?window=7d → install sparkline data
 *
 * Teaching note: The sparkline is an INLINE SVG — no chart library.
 * We normalise the bucket counts to [0, 1] and draw polyline points.
 * SVG is just HTML — it's zero-bundle-cost.
 */
import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuntimeData {
  runtimes: string[];
  tools_required: string[];
  frontmatter_present: boolean;
  inferred: boolean;
}

interface InstallBucket {
  date: string;
  count: number;
}

interface InstallEvents {
  window_days: number;
  buckets: InstallBucket[];
  total_in_window: number;
  total_all_time: number;
}

interface RuntimePanelProps {
  slug: string;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

/**
 * Simple SVG sparkline. Width=120, height=32.
 * We plot bucket counts as a polyline — no chart lib needed.
 *
 * Teaching note: viewBox lets SVG scale to any size via CSS.
 * The polyline points are computed as percentages of the chart height.
 */
function Sparkline({ buckets }: { buckets: InstallBucket[] }) {
  if (!buckets || buckets.length < 2) {
    return (
      <span className="text-[10px] text-muted-soft">No install data for last 7d</span>
    );
  }

  const W = 120;
  const H = 32;
  const counts = buckets.map(b => b.count);
  const maxVal = Math.max(...counts, 1); // avoid divide-by-zero

  const points = counts
    .map((c, i) => {
      const x = (i / (counts.length - 1)) * W;
      const y = H - (c / maxVal) * (H - 4); // 4px top margin
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-label="Install activity last 7 days"
      role="img"
    >
      {/* Background */}
      <rect width={W} height={H} rx="4" fill="rgba(255,209,102,0.04)" />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* Dots at each point */}
      {counts.map((c, i) => {
        const x = (i / (counts.length - 1)) * W;
        const y = H - (c / maxVal) * (H - 4);
        return <circle key={i} cx={x} cy={y} r="1.5" fill="var(--color-accent)" opacity="0.9" />;
      })}
    </svg>
  );
}

// ─── Runtime badge ────────────────────────────────────────────────────────────

function RuntimeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border border-border-soft text-muted bg-bg-elev">
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RuntimePanel({ slug }: RuntimePanelProps) {
  const [runtime, setRuntime] = useState<RuntimeData | null>(null);
  const [installs, setInstalls] = useState<InstallEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/skills/${slug}/runtime`, { credentials: 'include' }),
      fetch(`/api/skills/${slug}/install-events?window=7d`, { credentials: 'include' }),
    ])
      .then(async ([rRes, iRes]) => {
        if (cancelled) return;
        const rData: RuntimeData | null = rRes.ok ? await rRes.json() : null;
        const iData: InstallEvents | null = iRes.ok ? await iRes.json() : null;
        setRuntime(rData);
        setInstalls(iData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse flex flex-col gap-3" role="status" aria-label="Loading runtime info">
        <div className="h-4 rounded bg-bg-elev w-1/2" />
        <div className="h-4 rounded bg-bg-elev w-3/4" />
        <div className="h-8 rounded bg-bg-elev w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-muted-soft" role="alert">{error}</p>;
  }

  const hasRuntime = runtime && (runtime.runtimes?.length > 0 || runtime.tools_required?.length > 0);
  const hasInstalls = installs && installs.buckets && installs.buckets.length > 0;

  if (!hasRuntime && !hasInstalls) {
    return <p className="text-xs text-muted-soft">No runtime data available.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Install sparkline */}
      {hasInstalls && (
        <div>
          <p className="eyebrow mb-2">Install activity</p>
          <Sparkline buckets={installs!.buckets} />
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-soft tabular-nums">
            <span>{installs!.total_in_window} installs / 7d</span>
            <span>{installs!.total_all_time.toLocaleString()} total</span>
          </div>
        </div>
      )}

      {/* Runtime badges */}
      {runtime && runtime.runtimes && runtime.runtimes.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Runtimes</p>
          <div className="flex flex-wrap gap-1.5">
            {runtime.runtimes.map(r => <RuntimeBadge key={r} label={r} />)}
          </div>
          {runtime.inferred && (
            <p className="text-[10px] text-muted-soft mt-1">Inferred from skill content</p>
          )}
        </div>
      )}

      {/* Tools required */}
      {runtime && runtime.tools_required && runtime.tools_required.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Tools required</p>
          <div className="flex flex-wrap gap-1.5">
            {runtime.tools_required.map(t => <RuntimeBadge key={t} label={t} />)}
          </div>
        </div>
      )}

      {/* Frontmatter presence indicator */}
      {runtime && (
        <div className="text-[10px] text-muted-soft flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${runtime.frontmatter_present ? 'bg-success' : 'bg-muted-soft'}`}
            aria-hidden="true"
          />
          {runtime.frontmatter_present ? 'Frontmatter present' : 'No frontmatter detected'}
        </div>
      )}
    </div>
  );
}
