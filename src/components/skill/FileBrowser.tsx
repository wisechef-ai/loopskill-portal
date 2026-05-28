/**
 * FileBrowser — left sidebar for the skill detail page (Phase Q).
 *
 * Fetches /api/skills/{slug}/files and renders a grouped tree:
 *   SKILL.md  (always first)
 *   scripts/  (grouped)
 *   references/
 *   templates/
 *
 * Teaching note: This is an Astro "island" — a React component that
 * renders nothing on the server and hydrates on the client when visible.
 */
import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillFile {
  path: string;
  size: number;
  type: string;
}

export interface FilesResponse {
  version: string;
  files: SkillFile[];
  total_files: number;
  total_bytes: number;
}

export interface FileBrowserProps {
  slug: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  /** Called once the files list has been fetched — used by parent to detect single-file mode */
  onFilesLoaded?: (count: number) => void;
  /** User's subscription tier — used to show lock icons on gated files */
  userTier?: string;
  /** The skill's required tier */
  skillTier?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Group a flat file list into: root files (SKILL.md etc.) + directory groups */
function groupFiles(files: SkillFile[]): Map<string, SkillFile[]> {
  const groups = new Map<string, SkillFile[]>();
  groups.set('', []); // root files

  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length === 1) {
      groups.get('')!.push(f);
    } else {
      const dir = parts[0] + '/';
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(f);
    }
  }
  return groups;
}

// Tier rank for lock-icon checks
const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1, cook: 1,
  pro_plus: 2, operator: 2, studio: 2,
};

export function isFileLocked(
  skillTier: string | undefined,
  userTier: string | undefined,
  path: string,
): boolean {
  // SKILL.md is always accessible
  if (path === 'SKILL.md') return false;
  if (!skillTier || !userTier) return false;
  const skillRank = TIER_RANK[skillTier] ?? 1;
  const userRank = TIER_RANK[userTier] ?? 0;
  return userRank < skillRank;
}

// ─── LockIcon ─────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

// ─── FileRow ─────────────────────────────────────────────────────────────────

function FileRow({
  file,
  selected,
  locked,
  onClick,
}: {
  file: SkillFile;
  selected: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const name = file.path.split('/').at(-1) ?? file.path;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      title={locked ? 'Upgrade to Pro to access this file' : file.path}
      data-testid="file-row"
      data-path={file.path}
      aria-current={selected ? 'true' : undefined}
      className={[
        'w-full text-left px-2 py-1.5 rounded flex items-center gap-1.5 text-xs transition',
        selected
          ? 'bg-accent/15 text-accent border border-accent/30'
          : 'text-muted hover:bg-bg-elev hover:text-text',
        locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {locked && <LockIcon />}
      <span className="truncate flex-1 font-mono">{name}</span>
      <span className="text-[10px] text-muted-soft shrink-0 tabular-nums">
        {formatBytes(file.size)}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FileBrowser({
  slug,
  selectedPath,
  onSelect,
  onFilesLoaded,
  userTier,
  skillTier,
}: FileBrowserProps) {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${slug}/files`, { credentials: 'include' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json: FilesResponse = await res.json();
      setData(json);
      onFilesLoaded?.(json.total_files);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error';
      if (retryCount < 2) {
        // Auto-retry up to 2x
        setTimeout(() => setRetryCount(r => r + 1), 800 * (retryCount + 1));
      } else {
        setError(msg);
        // Signal parent on failure so it can handle gracefully
        onFilesLoaded?.(2);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, retryCount, onFilesLoaded]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-1 animate-pulse" role="status" aria-label="Loading files">
        {[60, 80, 70, 55].map((w, i) => (
          <div key={i} className="h-7 rounded bg-bg-elev" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  // ── Error state (after 2 retries) ──────────────────────────────────────────
  if (error) {
    return (
      <div className="text-xs text-muted-soft flex flex-col gap-2" role="alert">
        <p>File listing unavailable — install still works.</p>
        <button
          type="button"
          onClick={() => { setRetryCount(0); setError(null); }}
          className="text-accent hover:underline text-left"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.files.length === 0) {
    return <p className="text-xs text-muted-soft">No files found.</p>;
  }

  // Hide the browser entirely when only SKILL.md present (parent goes full-width)
  if (data.files.length === 1 && data.files[0].path === 'SKILL.md') {
    return null;
  }

  const groups = groupFiles(data.files);
  const rootFiles = groups.get('') ?? [];
  const dirs = [...groups.entries()].filter(([k]) => k !== '');

  const anyLocked = data.files.some(
    f => f.path !== 'SKILL.md' && isFileLocked(skillTier, userTier, f.path),
  );

  return (
    <nav aria-label="Skill files" data-testid="file-browser">
      {/* Root-level files (SKILL.md) */}
      {rootFiles.map(f => (
        <FileRow
          key={f.path}
          file={f}
          selected={selectedPath === f.path}
          locked={isFileLocked(skillTier, userTier, f.path)}
          onClick={() => onSelect(f.path)}
        />
      ))}

      {/* Directory groups */}
      {dirs.map(([dir, files]) => (
        <div key={dir} className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-soft px-2 mb-1 font-semibold">
            {dir}
          </p>
          {files.map(f => (
            <FileRow
              key={f.path}
              file={f}
              selected={selectedPath === f.path}
              locked={isFileLocked(skillTier, userTier, f.path)}
              onClick={() => onSelect(f.path)}
            />
          ))}
        </div>
      ))}

      {/* Upgrade CTA when files are locked */}
      {anyLocked && (
        <div className="mt-3 border border-border-soft rounded-lg p-3 text-xs text-muted-soft">
          <p className="font-semibold text-muted mb-1">
            🔒 Upgrade to Pro to access scripts and references
          </p>
          <a href="/pricing" className="text-accent hover:underline">
            See plans →
          </a>
        </div>
      )}

      {/* Footer: file count + total size */}
      <div className="mt-3 pt-3 border-t border-border-soft text-[10px] text-muted-soft flex justify-between tabular-nums">
        <span>{data.total_files} file{data.total_files === 1 ? '' : 's'}</span>
        <span>{formatBytes(data.total_bytes)}</span>
      </div>
    </nav>
  );
}
