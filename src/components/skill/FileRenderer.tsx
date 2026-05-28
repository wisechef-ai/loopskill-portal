/**
 * FileRenderer — center panel for the skill detail page (Phase Q).
 *
 * Fetches /api/skills/{slug}/file?path= and renders it.
 *
 * Teaching note: The API returns either plain text OR
 * {encoding: "base64", content: "..."} for binary files.
 * We detect that shape and show a placeholder instead of raw binary.
 *
 * Markdown is rendered via the `marked` library (already a project dep).
 * Code files get a styled <pre><code> block. No heavy syntax lib added.
 */
import { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileContent {
  encoding?: 'base64';
  content: string;
}

interface FileRendererProps {
  slug: string;
  path: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isMarkdown(path: string): boolean {
  return path.endsWith('.md') || path.endsWith('.markdown');
}

function isCodeFile(path: string): boolean {
  const codeExts = ['.py', '.sh', '.js', '.ts', '.tsx', '.jsx', '.yaml', '.yml', '.json', '.toml', '.env', '.txt', '.csv'];
  return codeExts.some(ext => path.endsWith(ext));
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

function renderMarkdown(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(stripFrontmatter(md)) as string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FileRenderer({ slug, path }: FileRendererProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const [binaryBytes, setBinaryBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFile = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    setContent(null);
    setIsBinary(false);
    try {
      const res = await fetch(
        `/api/skills/${slug}/file?path=${encodeURIComponent(path)}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        throw new Error(`API ${res.status}${res.status === 403 ? ' — Pro subscription required' : ''}`);
      }

      // The API returns either plain text or a JSON envelope for binary
      const text = await res.text();
      let parsed: FileContent | null = null;
      try {
        parsed = JSON.parse(text) as FileContent;
      } catch {
        // Not JSON → plain text
      }

      if (parsed && parsed.encoding === 'base64') {
        setIsBinary(true);
        // Decode to measure byte length
        try {
          const decoded = atob(parsed.content);
          setBinaryBytes(decoded.length);
        } catch {
          setBinaryBytes(0);
        }
      } else {
        setContent(parsed?.content ?? text);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [slug, path]);

  useEffect(() => { fetchFile(); }, [fetchFile]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse flex flex-col gap-3 p-6" role="status" aria-label="Loading file">
        <div className="h-4 rounded bg-bg-elev w-3/4" />
        <div className="h-4 rounded bg-bg-elev w-full" />
        <div className="h-4 rounded bg-bg-elev w-5/6" />
        <div className="h-4 rounded bg-bg-elev w-2/3" />
        <div className="h-4 rounded bg-bg-elev w-full" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6 flex flex-col gap-3" role="alert">
        <p className="text-sm text-muted-soft">{error}</p>
        <button
          type="button"
          onClick={fetchFile}
          className="text-xs text-accent hover:underline text-left w-fit"
        >
          ↩ Retry
        </button>
      </div>
    );
  }

  // ── Binary file placeholder ───────────────────────────────────────────────
  if (isBinary) {
    return (
      <div className="p-6 text-xs text-muted-soft italic">
        Binary file — {binaryBytes > 0 ? `${binaryBytes.toLocaleString()} bytes` : 'size unknown'}
      </div>
    );
  }

  if (content === null) {
    return <div className="p-6 text-xs text-muted-soft">Empty file.</div>;
  }

  // ── Markdown rendering ────────────────────────────────────────────────────
  if (isMarkdown(path)) {
    const html = renderMarkdown(content);
    return (
      <article
        className="prose p-6 max-w-none"
        /* eslint-disable-next-line react/no-danger */
        dangerouslySetInnerHTML={{ __html: html }}
        data-file-content
      />
    );
  }

  // ── Code file rendering ───────────────────────────────────────────────────
  if (isCodeFile(path)) {
    return (
      <pre className="m-0 p-5 text-xs font-mono text-muted leading-relaxed overflow-x-auto" data-file-content>
        <code>{content}</code>
      </pre>
    );
  }

  // ── Fallback: plain text ──────────────────────────────────────────────────
  return (
    <pre className="m-0 p-5 text-xs font-mono text-muted leading-relaxed overflow-x-auto whitespace-pre-wrap" data-file-content>
      {content}
    </pre>
  );
}
