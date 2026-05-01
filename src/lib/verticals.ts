/**
 * Vertical metadata + category-fallback classifier (Plan v5.4 / A.5).
 *
 * The 16 legacy categories collapse to 6 verticals. The API will eventually
 * accept `?vertical=<slug>` directly; until then, vertical pages fetch the
 * full catalog and filter client-side using `classifyCategory()` as a backup
 * for any row whose `vertical` field is not yet populated.
 */
export const VERTICALS = [
  { slug: 'marketing',     label: 'Marketing',      icon: 'chart',     desc: 'Reports, calendars, audits, proposals' },
  { slug: 'code',          label: 'Code',           icon: 'terminal',  desc: 'Code review, refactors, test scaffolds' },
  { slug: 'web-scraping',  label: 'Web scraping',   icon: 'search',    desc: 'Stealth scrapers, structured extraction' },
  { slug: 'ops',           label: 'Ops',            icon: 'box',       desc: 'Onboarding, invoicing, standups' },
  { slug: 'sales',         label: 'Sales',          icon: 'mail',      desc: 'Outreach, CRM ops, proposals' },
  { slug: 'sim-robotics',  label: 'Sim & robotics', icon: 'lightning', desc: 'ROS workflows, simulation pipelines' },
] as const;

export type VerticalSlug = typeof VERTICALS[number]['slug'];

const RULES: { vertical: VerticalSlug; needles: string[] }[] = [
  { vertical: 'marketing',    needles: ['market', 'report', 'seo', 'content', 'social', 'ads', 'campaign', 'calendar', 'analytics', 'client'] },
  { vertical: 'code',         needles: ['code', 'dev', 'engineer', 'review', 'refactor', 'test', 'ci', 'build', 'lint'] },
  { vertical: 'web-scraping', needles: ['scrap', 'crawl', 'extract', 'harvest', 'spider'] },
  { vertical: 'sales',        needles: ['sales', 'outreach', 'crm', 'lead', 'proposal', 'deal', 'pipeline'] },
  { vertical: 'sim-robotics', needles: ['sim', 'robot', 'ros', 'isaac', 'gazebo', 'drone', 'control'] },
  { vertical: 'ops',          needles: ['ops', 'operation', 'onboard', 'invoice', 'standup', 'admin', 'infra', 'deploy', 'monitor'] },
];

export function classifyCategory(category: string | undefined | null): VerticalSlug {
  const cat = (category || '').toLowerCase().trim();
  if (!cat) return 'ops';
  for (const { vertical, needles } of RULES) {
    if (needles.some(n => cat.includes(n))) return vertical;
  }
  return 'ops';
}

export function skillVertical(skill: any): VerticalSlug {
  if (skill?.vertical && VERTICALS.find(v => v.slug === skill.vertical)) {
    return skill.vertical as VerticalSlug;
  }
  return classifyCategory(skill?.category);
}
