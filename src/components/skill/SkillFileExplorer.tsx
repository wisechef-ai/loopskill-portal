/**
 * SkillFileExplorer — parent island for the skill detail page (Phase Q).
 *
 * Owns the `selectedPath` state shared between FileBrowser (left sidebar)
 * and FileRenderer (center panel).
 *
 * Teaching note: Why ONE parent component instead of two separate islands?
 * Astro islands are isolated — they can't share React state. If FileBrowser
 * and FileRenderer were separate islands, clicking a file in the browser
 * couldn't tell the renderer to load a different file. By wrapping both
 * in a single parent, useState keeps them in sync.
 *
 * Layout:
 *   [FileBrowser sidebar? | FileRenderer center panel]
 *   The sidebar is hidden when only SKILL.md exists (single-file mode).
 */
import { useState, useEffect } from 'react';
import { FileBrowser } from './FileBrowser';
import { FileRenderer } from './FileRenderer';

interface SkillFileExplorerProps {
  slug: string;
  /** Default file to open — always SKILL.md */
  defaultPath?: string;
  /** User's tier for lock-icon rendering */
  userTier?: string;
  /** Skill's required tier */
  skillTier?: string;
}

export function SkillFileExplorer({
  slug,
  defaultPath = 'SKILL.md',
  userTier,
  skillTier,
}: SkillFileExplorerProps) {
  const [selectedPath, setSelectedPath] = useState<string>(defaultPath);

  /**
   * multiFile: null = loading/unknown, false = single file, true = multi-file
   * Controls whether the sidebar is rendered.
   */
  const [multiFile, setMultiFile] = useState<boolean | null>(null);

  // Reset to default file when slug changes
  useEffect(() => {
    setSelectedPath(defaultPath);
    setMultiFile(null);
  }, [slug, defaultPath]);

  // Called by FileBrowser once files are fetched
  const handleFilesLoaded = (count: number) => {
    setMultiFile(count > 1);
  };

  // Show sidebar unless we've confirmed it's single-file mode
  const showSidebar = multiFile !== false;

  return (
    <div className="flex min-h-0" data-testid="skill-file-explorer">
      {/* LEFT: File tree sidebar (hidden in single-file mode) */}
      {showSidebar && (
        <div
          className="w-52 shrink-0 border-r border-border-soft overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 200px)', minHeight: '180px' }}
        >
          <div className="p-3">
            <FileBrowser
              slug={slug}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              onFilesLoaded={handleFilesLoaded}
              userTier={userTier}
              skillTier={skillTier}
            />
          </div>
        </div>
      )}

      {/* CENTER: File content panel */}
      <div className="flex-1 min-w-0 overflow-auto">
        <FileRenderer slug={slug} path={selectedPath} />
      </div>
    </div>
  );
}
