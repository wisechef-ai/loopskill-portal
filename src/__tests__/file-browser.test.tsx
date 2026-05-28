/**
 * file-browser.test.tsx — smoke test for FileBrowser (Phase Q)
 *
 * Teaching note: We mock `fetch` so the test never hits a real server.
 * We render FileBrowser with a mock files response, assert the list
 * appears, and assert clicking a file triggers the onSelect callback.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FileBrowser } from '../components/skill/FileBrowser';

// ─── Mock fetch ────────────────────────────────────────────────────────────────

const MOCK_FILES = {
  version: '1.0.0',
  files: [
    { path: 'SKILL.md', size: 4096, type: 'text/markdown' },
    { path: 'scripts/install.sh', size: 512, type: 'text/x-sh' },
    { path: 'references/guide.md', size: 1024, type: 'text/markdown' },
  ],
  total_files: 3,
  total_bytes: 5632,
};

function makeFetchSuccess() {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_FILES),
    } as unknown as Response),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchSuccess());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileBrowser', () => {
  it('renders the files list after fetch resolves', async () => {
    const onSelect = vi.fn();

    render(
      React.createElement(FileBrowser, {
        slug: 'larry',
        selectedPath: 'SKILL.md',
        onSelect,
      }),
    );

    // Should eventually show the file browser nav
    await waitFor(() => {
      expect(screen.getByTestId('file-browser')).toBeTruthy();
    });

    // All 3 file rows should be present
    const rows = screen.getAllByTestId('file-row');
    expect(rows.length).toBe(3);
  });

  it('shows the correct file names in each row', async () => {
    const onSelect = vi.fn();

    render(
      React.createElement(FileBrowser, {
        slug: 'larry',
        selectedPath: 'SKILL.md',
        onSelect,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('SKILL.md')).toBeTruthy();
    });

    expect(screen.getByText('install.sh')).toBeTruthy();
    expect(screen.getByText('guide.md')).toBeTruthy();
  });

  it('calls onSelect with the correct path when a file row is clicked', async () => {
    const onSelect = vi.fn();

    render(
      React.createElement(FileBrowser, {
        slug: 'larry',
        selectedPath: 'SKILL.md',
        onSelect,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-browser')).toBeTruthy();
    });

    // Click the install.sh row
    const installRow = screen.getByText('install.sh').closest('button')!;
    await act(async () => { fireEvent.click(installRow); });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('scripts/install.sh');
  });

  it('marks the selected file with aria-current=true', async () => {
    const onSelect = vi.fn();

    render(
      React.createElement(FileBrowser, {
        slug: 'larry',
        selectedPath: 'SKILL.md',
        onSelect,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-browser')).toBeTruthy();
    });

    const skillMdRow = screen.getByText('SKILL.md').closest('button');
    expect(skillMdRow?.getAttribute('aria-current')).toBe('true');
  });

  it('shows error message after fetch fails', async () => {
    // Override global fetch to always fail immediately
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    const onSelect = vi.fn();

    render(
      React.createElement(FileBrowser, {
        slug: 'larry',
        selectedPath: 'SKILL.md',
        onSelect,
      }),
    );

    // Wait for the error state — the component retries 2x with setTimeout delays.
    // We increase the timeout to allow all retries to complete.
    await waitFor(
      () => {
        expect(screen.getByText(/File listing unavailable/i)).toBeTruthy();
      },
      { timeout: 10_000 },
    );

    expect(screen.getByText('Retry')).toBeTruthy();
  }, 15_000);
});
