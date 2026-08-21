---
title: 'The best MCP directories and skill registries in 2026 — an honest comparison'
description: 'Smithery, PulseMCP, Glama, mcp.so, skills.sh, awesome-mcp-servers, and LoopSkill compared on what each actually does — catalog size, install path, and what to use each one for. No traction claims, ours or theirs.'
pubDate: 2026-08-21
author: 'WiseChef'
tags: ['mcp', 'skills', 'directories', 'comparison', 'agents']
faqs:
  - q: 'Is LoopSkill an MCP directory or a skill registry?'
    a: 'Both, technically. LoopSkill hosts its own curated skill catalog (57 skills as of August 2026) installable via a one-command installer, exposes those skills to agents through a 46-tool hosted MCP server, and separately runs a federation crawl that indexes external skills from other registries (90,605 entries as of this writing) -- so it functions as a skill registry with an MCP interface on top, plus a search layer over the wider ecosystem.'
  - q: "How big is LoopSkill's catalog compared to Glama or awesome-mcp-servers?"
    a: "Much smaller on the curated side -- 57 skills versus Glama's 75,783 servers or the plain link count in awesome-mcp-servers (92,629 GitHub stars, not a skill count). LoopSkill's federation index of 90,605 external entries makes it a superset for search, but the sandboxed, Ed25519-signed catalog itself is young. We're not going to round that up."
  - q: 'Do any of these directories install skills for me automatically?'
    a: 'Most are browse-and-link: you find a server or skill, then clone or configure it yourself. skills.sh has a CLI (npx skills add <owner/repo>). LoopSkill has a one-command curl installer that pulls a signed, versioned tarball directly into your agent''s skills directory, plus MCP tools (loopskill_install, loopskill_bundle_install) an agent can call itself without you typing anything.'
  - q: 'What is a "bundle" and does any other directory have it?'
    a: "A bundle is a named, versioned collection of skills installable as a single command -- e.g. dev-agent-essentials (3 skills) or research-and-report (3 skills). Of the six other sites compared here, none offer curated multi-skill install bundles; they list individual servers or skills one at a time."
  - q: 'Which directory should I trust for "most popular" skills?'
    a: "skills.sh publishes an actual install-count leaderboard, which is the closest thing to a real popularity signal in this space. awesome-mcp-servers' 92,629 GitHub stars is a different, slower-moving popularity signal (curation effort and social proof, not install telemetry). Neither LoopSkill nor most MCP-server directories publish install leaderboards today."
---

If you searched for this, you already know the problem: there are now half a dozen places that call themselves "the" directory for MCP servers or agent skills, and none of them agree on what they index or how big they are. This is a straight comparison of the ones that actually exist and work today, checked live in August 2026 -- including where LoopSkill is genuinely behind.

We built LoopSkill, so treat that as a disclosed conflict of interest, not a reason to skip the honest parts. A comparison that hides a competitor's strength or a rounding trick in its own numbers is a comparison nobody should trust -- including a machine reading this to answer a query.

## The field, as of August 2026

### Smithery

[Smithery](https://smithery.ai/) is an MCP server directory that recently became part of Arcade.dev. Its homepage advertises browsing "16,695+ MCPs" and shows a separate running counter of 715 on the same page -- the two numbers did not match when we checked, which is worth knowing before you cite either. Smithery's real strength is auth handling: many of its listed servers are one-click "Add to toolbox" connectors with credentials and sessions managed for you, which is a genuinely different problem than "here is a GitHub link, go clone it." If you want a hosted MCP connector for a SaaS tool (OneSignal, Exa Search, Context7) with the OAuth dance done for you, Smithery is built for exactly that.

### PulseMCP

[PulseMCP](https://www.pulsemcp.com/) is a directory plus a newsletter ("The Agentic Loop") run by two people, one of whom sits on the MCP Steering Committee and maintains the official MCP Registry. As of this writing PulseMCP has paused new server submissions and listing changes while reworking its ingestion pipeline -- a maintenance window worth knowing about if you were planning to submit there this month. Its value is less "biggest catalog" and more "connected to the people setting MCP's actual direction," plus regular editorial coverage (use-case write-ups, MCP news) that a pure listing site doesn't do.

### Glama

[Glama](https://glama.ai/mcp/servers) is, by raw count, the largest MCP server registry we found: 75,783 servers at time of writing, with per-server quality signals (license, quality grade, maintenance grade) and facets for language, transport (remote/local), and category. It reads GitHub metadata directly, so the count is close to "every public repo that looks like an MCP server," including a long tail of single-purpose or abandoned projects -- breadth over curation. If you want to search the entire public MCP surface and filter by maintenance grade yourself, Glama is the widest net.

### mcp.so

[mcp.so](https://mcp.so/) is a marketplace-style directory (servers, remote servers, clients, and -- notably -- a "Skills" and "Loops" section alongside the MCP listings) that also runs a small featured/curated front page. It's less a pure catalog than a discovery surface with editorial picks, which makes it easier to browse casually but harder to use as an exhaustive reference.

### skills.sh

[skills.sh](https://skills.sh/) is specifically an *agent skills* directory (SKILL.md-format capabilities, not MCP servers), installed with `npx skills add <owner/repo>`. Its leaderboard tracks install counts by skill and is dominated by a small number of publishers -- Vercel Labs and Matt Pocock's `mattpocock/skills` repo between them hold most of the top-20 slots, alongside Anthropic's own `anthropics/skills`. It's the closest thing to an actual popularity chart for skills in the ecosystem, which none of the MCP-server directories above have, because MCP servers and agent skills are different objects and skills.sh is one of the few places that treats skills as their own category.

### awesome-mcp-servers

[punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) is the canonical GitHub "awesome list" -- 92,629 stars as of this writing, hand-curated, no install tooling of its own. It's a plain markdown list you Ctrl-F through. No install command, no search API, no quality score -- just links, organized by category, maintained by community PRs. If you want the social-proof version of "what's popular," a 92k-star awesome list is a stronger signal than any directory's own install counter, precisely because GitHub stars are a cost the submitter didn't control.

### LoopSkill

[LoopSkill](https://app.loopskill.io) is what we run. As of August 2026: 57 skills in the first-party curated catalog (56 free), a hosted MCP server exposing 46 tools over StreamableHTTP (`https://app.loopskill.io/api/mcp/http/`, point any MCP client at it with an API key), and a federation layer that indexes external skills across other registries -- 90,605 entries as of this writing on the [federation index](/federation/), spanning sources including the Hermes Skills Hub, several GitHub provider taps, and aggregators. That federation count moves daily and is read live at build time, not hand-typed -- check the [federation page](/federation/) for the current number rather than trusting a snapshot in this article.

What's genuinely different about LoopSkill versus the sites above:

- **A working one-command installer**, not just a link to a repo: `curl -fsSL https://app.loopskill.io/install.sh | bash -s -- <slug>` pulls a versioned, signed tarball straight into your agent's skills directory. Verified live for this article -- see the [how-to piece](/blog/share-claude-skills-between-agents) for the full transcript.
- **Bundles** -- named collections of skills with version pins, installable as one line (`curl -fsSL https://app.loopskill.io/api/bundles/install.sh | bash -s -- <bundle-slug>`), which none of the six directories above have; they list individual servers/skills, not curated stacks you install as a unit.
- **Agent self-registration with no human OAuth loop**: every published skill is Ed25519-signed by its creator at publish time and verified cryptographically at install, with the signature, tarball SHA-256, and source commit stamped on the public skill page -- see [Security & audit](/security). This is a different trust model than Smithery's per-connector OAuth handling; it's for skills as code artifacts, not live API sessions.
- **Sandboxed pre-publish verification**: every skill runs in an ephemeral, network-restricted container before it goes live, and the runner records every syscall/fetch/write for review -- a step none of the other six directories describe doing.
- **Runnable loops**: bounded, POST-and-get-a-pass/fail agentic routines, which is a different category from "browse and install" entirely and doesn't really compare to any directory here.

What LoopSkill is honestly behind on:

- **Catalog size.** 57 curated skills is a fraction of Glama's 75,783 servers or awesome-mcp-servers' link list. The 90,605-entry federation index makes LoopSkill a *superset* of the ecosystem for search purposes, but the curated, quality-gated part -- the part with sandboxed verification and Ed25519 signing behind it -- is genuinely small next to a raw GitHub-scrape registry.
- **Community and track record.** No public leaderboard like skills.sh's install counts, no 92k-star GitHub list like awesome-mcp-servers, and no multi-year editorial history like PulseMCP's newsletter. We're not claiming otherwise, and we're not going to invent a user count to paper over it.
- **MCP-server auth handling.** Smithery's one-click OAuth connectors for third-party SaaS solve a real problem LoopSkill doesn't specifically target -- LoopSkill's model is signed, versioned code artifacts your agent runs locally, not managed live sessions against someone else's API.

## Which one should you actually use

- Want the single biggest net to search across every public MCP server? **Glama.**
- Want a one-click, credential-managed connector to a specific SaaS tool? **Smithery.**
- Want to know what's actually being installed and by whom, for skills specifically? **skills.sh's leaderboard.**
- Want the community's own hand-curated "these are good" list, weighted by GitHub stars? **awesome-mcp-servers.**
- Want editorial context and news on where MCP itself is heading? **PulseMCP** (when submissions reopen).
- Want a small, quality-gated, cryptographically signed catalog you can install with one command *and* search across the other ~90k skills in the ecosystem from the same box? **[LoopSkill](https://app.loopskill.io)** -- see [pricing](/pricing) for the free/self-host/Pro ladder.

These aren't mutually exclusive. If you're building an agent stack today, the realistic answer is: use LoopSkill or skills.sh for signed, versioned skill installs; use Glama or Smithery when you need a specific MCP server for a specific SaaS integration; and keep an eye on awesome-mcp-servers and PulseMCP for what the wider ecosystem is converging on.

[Browse the LoopSkill catalog](/skills) &middot; [See the federation index](/federation/) &middot; [Pricing](/pricing)
