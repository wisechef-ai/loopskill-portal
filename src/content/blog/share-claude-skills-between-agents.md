---
title: 'How to share Claude skills between agents (and keep them updated)'
description: 'Copy-paste skill drift is a real problem once you run more than one Claude Code, Cursor, or Hermes agent. Here is the manual approach, its limits, and a one-command path that keeps every agent on the same versioned skill -- tested live end-to-end.'
pubDate: 2026-08-21
author: 'WiseChef'
tags: ['claude-code', 'skills', 'mcp', 'agents', 'how-to']
faqs:
  - q: 'How do I share a Claude Code skill with another machine or agent?'
    a: 'Manually: copy the skill folder from ~/.claude/skills/<name> to the other machine, or point both machines at the same git repo. Automated: curl -fsSL https://app.loopskill.io/install.sh | bash -s -- <slug> pulls the same signed, versioned skill onto any machine in one command, and re-running it later pulls the update.'
  - q: 'Does LoopSkill work with agents other than Claude Code?'
    a: "Yes. The install.sh script and the MCP server both work with any agent that reads a local skills directory or speaks MCP -- Claude Code, Claude Desktop, Cursor, Cline, Continue.dev, Zed, OpenClaw, Codex CLI, and Hermes are all documented integration paths. We tested the install.sh path for this article; we did not re-verify every listed client for this piece."
  - q: 'Is there a free way to try this, or do I need an account?'
    a: 'Yes -- every skill in the LoopSkill catalog installs free today, no account and no API key required. An account and API key are only needed for Pro-tier skills (when the catalog has any), publishing your own skill, or multi-agent fleet sync. Check /skills for the current catalog and what, if anything, sits behind Pro.'
  - q: 'How do I keep a skill updated across five agents without doing it five times?'
    a: 'Bundles plus fleet sync. Put the skills in a bundle, create a fleet (loopskill_fleet_create), subscribe the bundle to it, distribute one fleet key to all five agents, and call loopskill_fleet_sync on each. Every agent pulls the same pinned versions from one place -- update the bundle once, sync propagates it.'
  - q: 'What actually happens when I run the install.sh script?'
    a: 'It resolves the slug against the LoopSkill API, downloads a signed tarball (Ed25519-signed at publish, verified by the API before serving), and unpacks it into ~/.claude/skills/<slug> (or $LOOPSKILL_INSTALL_DIR if set). Free-tier skills need no key; Pro-tier skills require LOOPSKILL_API_KEY and fail loudly, not silently, if it is missing.'
---

You install a skill on one agent. It works. Three weeks later you're setting up a second machine, or a second agent for a different client, and you can't remember which version of that skill you're running, whether you've since fixed a bug in it, or whether the copy on machine two is even the same file. This is skill drift, and it is the single most common failure mode once you're running more than one AI agent.

This piece covers the manual ways people solve it today, their real limits, and a tested, one-command path that avoids the problem entirely.

## The problem: copy-paste drift

A Claude Code skill lives as a folder under `~/.claude/skills/<name>/` -- a `SKILL.md` file plus whatever scripts, templates, or references it needs. There's no built-in versioning, no built-in distribution, and no built-in "did this change since I last looked" signal. If you have two agents (two machines, two clients, a laptop and a CI runner), you have two independent copies of that folder, and nothing keeps them in sync unless you make it your job.

## Manual approach 1: a git repo

The obvious fix: put your skills in a git repo, clone it on every machine, `git pull` before you start work.

This genuinely works and a lot of people do it. Its real limits:

- **You are the sync mechanism.** Nothing tells you machine three is four commits behind. You find out when it behaves differently than you expect.
- **No install-time verification.** A `git pull` doesn't check that the file you're about to run hasn't been tampered with, or that it's signed by whoever actually wrote it -- you're trusting the git remote and your own access control.
- **No per-skill versioning story.** You can tag releases if you're disciplined, but most repos of "my skills" don't, so "roll back to the version from two weeks ago" means digging through git log, not running one command.
- **Doesn't compose across authors.** If you want ten skills from ten different people, you're now tracking ten repos, or hoping one person maintains a folder of everyone else's work.

## Manual approach 2: dotfiles-style symlinking

A variant of the git approach: keep skills in a dotfiles repo and symlink `~/.claude/skills` into it, the same way people manage `.bashrc` or `.vimrc` across machines. This solves the "which machine has which version" problem slightly better (one canonical source, symlinked everywhere) but inherits the same core issues: no signing, no versioning, and you're still the one running `git pull` and re-linking on every machine, including whatever CI or ephemeral agent environment you spin up next.

## The LoopSkill path

[LoopSkill](https://app.loopskill.io) treats a skill as a versioned, signed, installable artifact instead of a folder you hand-copy. It also indexes 91k+ skills from other registries through its [federation search](/federation/), so the same install path works whether the skill lives in LoopSkill's own catalog or was found through the federated index -- worth knowing since a skill you need may not be first-party at all. Every command below was run live for this article on 2026-08-21.

### Install a single skill

```bash
curl -fsSL https://app.loopskill.io/install.sh | bash -s -- super-memory
```

What actually happened when we ran this:

```
LoopSkill: resolving skill 'super-memory'...
installed 'super-memory' v1.0.1 -> /home/adam/.claude/skills/super-memory

Done. Tell your agent: "You have a new skill in /home/adam/.claude/skills/super-memory — read its SKILL.md and follow it."
```

No account, no API key -- `super-memory` is one of the free-tier skills in the catalog (every skill in it installs free today; check [/skills](/skills) for the current lineup). The script pulled a versioned, Ed25519-signed tarball and unpacked it straight into `~/.claude/skills/`. Run the same command again on a second machine and you get the identical `v1.0.1` files, not "whatever was in the folder when someone last copied it."

### Install a whole stack at once (bundles)

If you install skills one at a time, you still have to remember which set of skills belongs together. A bundle is a named, versioned collection you install as one line:

```bash
curl -fsSL https://app.loopskill.io/api/bundles/install.sh | bash -s -- dev-agent-essentials
```

Live output from this run:

```
LoopSkill: installing bundle 'dev-agent-essentials' -> /home/adam/.claude/skills
installed 3 skill(s) to /home/adam/.claude/skills
```

`dev-agent-essentials` is a 3-skill bundle (adversarial code review + PR draft automation) that installs free, no key required. The same install line works through the top-level installer too: `curl -fsSL https://app.loopskill.io/install.sh | bash -s -- --bundle dev-agent-essentials`. If a bundle contains any Pro-locked skills, the script tells you by name and exits with a distinct code rather than silently installing a partial set -- see the bundle's own page, e.g. [/bundles/dev-agent-essentials](/bundles/dev-agent-essentials), for what's inside before you run it.

### Let the agent install its own skills (MCP)

The commands above are for a human running a shell. The more interesting path is letting the agent do it: point any MCP-capable client (Claude Code, Claude Desktop, Cursor, Cline, Continue.dev, Zed, OpenClaw) at LoopSkill's hosted MCP server and it gets two tools for exactly this:

```json
{
  "mcpServers": {
    "loopskill": {
      "url": "https://app.loopskill.io/api/mcp/http/",
      "headers": { "x-api-key": "rec_xx..." }
    }
  }
}
```

Then, from inside an agent conversation:

- `loopskill_install(slug="super-memory")` -- installs a single skill, same signed tarball as the curl path.
- `loopskill_bundle_install(slug="dev-agent-essentials")` -- installs a whole bundle.
- `loopskill_search(...)` -- searches across the federation index too, not just the first-party catalog, so the agent can find and install a skill that lives in another registry entirely.

No local install directory to manage by hand -- the agent asks for what it needs and gets it, which is the actual "agent-first" version of the getting-started flow LoopSkill's own docs describe: tell your agent "install the relevant skills from app.loopskill.io" and let it search, pick, and install through MCP rather than you browsing a website.

### Keeping five agents in sync: fleets

Bundles solve "install the same set once." Fleets solve "keep N agents on the same set as it changes." A fleet is a named group of agents that all share a bundle:

1. Create a bundle (or reuse one) and add skills to it.
2. `loopskill_fleet_create({ name: "Production Fleet" })` returns a `fleet_key` (format `rec_fleet_<hex>_<hex>`), shown once.
3. `loopskill_fleet_subscribe({ fleet_id, cookbook_id, channel: "stable" })` links the bundle to the fleet.
4. Distribute the fleet key to every agent as `LOOPSKILL_API_KEY`. A fleet key is bundle-scoped -- an agent using it can only install from the fleet's subscribed bundles, not browse the general catalog, which is what makes it safe to hand to five different machines.
5. On each agent, `loopskill_fleet_sync({ fleet_id, dry_run: false })` pulls it to the bundle's current pinned versions and reports exactly what changed per skill (`from`/`to` versions, `installed`/`updated` actions).

Update the bundle once -- bump a pinned skill version -- and every agent that runs `loopskill_fleet_sync` converges to it on its own schedule. Nobody has to remember which of the five machines still has the old copy, because there's no copy to remember; there's one bundle and N agents reconciling against it.

Fleet creation is free for a signed-in account (one member key included); Pro raises the member-key cap if you're distributing to more than a couple of agents -- see [pricing](/pricing).

## A reproducible example, start to finish

Everything below works today on the free tier, no account required for the first two steps:

```bash
# 1. Install one free skill on machine A
curl -fsSL https://app.loopskill.io/install.sh | bash -s -- super-memory

# 2. On machine B, run the exact same command
curl -fsSL https://app.loopskill.io/install.sh | bash -s -- super-memory
# Both machines now have byte-identical, signed v1.0.1 files.

# 3. Install a 3-skill bundle in one line, either machine
curl -fsSL https://app.loopskill.io/install.sh | bash -s -- --bundle dev-agent-essentials

# 4. For an agent-driven install instead of a human running curl, add the
#    MCP server (see the JSON config above) and call from inside the agent:
#    loopskill_install(slug="super-memory")
#    loopskill_bundle_install(slug="dev-agent-essentials")
```

For anything beyond "install the same free skills on a couple of machines" -- Pro-tier skills, publishing your own, or keeping five-plus agents converged without re-running curl by hand -- sign in free and set up a [bundle](/bundles/dev-agent-essentials), then a fleet, from the [docs](/docs).

[Docs: getting started](/docs) &middot; [Browse the catalog](/skills) &middot; [Search the federation index](/federation/) &middot; [Pricing](/pricing)
