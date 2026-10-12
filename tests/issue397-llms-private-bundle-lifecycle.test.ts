/**
 * loopskill-api#397 — an agent following llms.txt literally must find the whole
 * private-bundle lifecycle: create -> add -> install -> re-install to update.
 *
 * Found by a cold-agent repro (perclient_1110): llms.txt documented single-skill
 * enroll/search/install only, so "one private bundle per client, identical on
 * every machine" had no instructions. These assertions pin the verbs, the one
 * add-skill route that actually exists, and the honest statement about sync.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = readFileSync(join(ROOT, 'src', 'pages', 'llms.txt.ts'), 'utf8');

function section(): string {
  const a = SRC.indexOf('const privateBundlesSection');
  expect(a, 'privateBundlesSection missing from llms.txt.ts').toBeGreaterThan(-1);
  const b = SRC.indexOf('// mesh0408 T1-D', a);
  return SRC.slice(a, b);
}

describe('llms.txt: private bundles across machines (#397)', () => {
  it('has the section heading and is wired into the rendered body', () => {
    expect(section()).toContain('## Private bundles across machines');
    expect(SRC).toContain('const bundlesSection = publicBundlesSection + privateBundlesSection;');
    expect(SRC).toContain('${bundlesSection}${personalitiesSection}');
  });

  it('documents all four lifecycle steps with the real verbs', () => {
    const s = section();
    expect(s).toContain('loopskill_compose_bundle_from_links');
    expect(s).toMatch(/POST \$\{SITE\}\/api\/bundles\/\{bundle_id\}\/skills/);
    expect(s).toContain('"slug"');
    expect(s).toContain('loopskill_bundle_install');
    expect(s).toMatch(/run \\`loopskill_bundle_install\\` with the same \\`bundle_id\\` again/);
  });

  it('is honest about add-skill having no MCP tool and sync writing nothing locally', () => {
    const s = section();
    expect(s).toMatch(/no MCP tool for this yet/);
    expect(s).toMatch(/writes nothing on your machine/);
    expect(s).not.toMatch(/applies updates/i);
  });

  it('never presents sync as the way to update a machine', () => {
    expect(section()).toMatch(/\\`loopskill_sync\\` is optional/);
  });

  it('is static: does not depend on any catalog fetch result', () => {
    const s = section();
    expect(s).not.toMatch(/bundleLines|trendingLines|Res\.data/);
  });
});
