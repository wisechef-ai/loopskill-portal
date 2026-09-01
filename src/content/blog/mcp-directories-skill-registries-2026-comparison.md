---
title: 'The best MCP directories and skill registries in 2026 — an honest comparison'
description: 'Smithery, PulseMCP, Glama, mcp.so, skills.sh, awesome-mcp-servers, and LoopSkill compared on what each actually indexes, how big it is, and what to use each one for. No traction claims, ours or theirs.'
pubDate: 2026-08-21
author: 'WiseChef'
tags: ['mcp', 'skills', 'directories', 'comparison', 'agents']
faqs:
  - q: 'How many skills does LoopSkill index, and what does that number actually mean?'
    a: "LoopSkill's federation index reaches 91k+ skills as of this writing (live count always at /federation/, since it moves daily) -- that is metadata pulled from multiple upstream registries: name, description, source, license/trust signal, and a link back to the original listing. It is a searchable superset of the ecosystem, not 91k skills LoopSkill hosts, rehosts, or has individually verified. A much smaller subset -- browse the current lineup at /skills -- is hosted directly, versioned, Ed25519-signed at publish, and sandbox-verified before it goes live. The 91k+ figure is the search reach; the signed/verified guarantee applies to what's hosted."
  - q: 'How does that compare to Glama or awesome-mcp-servers?'
    a: "Same order of magnitude, different method. Glama lists 75,783 servers by reading GitHub metadata directly -- comparable in kind to LoopSkill's federation index (both are search-reach numbers, not verified-install numbers). awesome-mcp-servers publishes 92,629 GitHub stars, which is a popularity signal, not a skill or server count, and we're flagging that distinction rather than letting the two numbers look equivalent."
  - q: 'Do any of these directories install skills for me automatically?'
    a: 'Most are browse-and-link: you find a server or skill, then clone or configure it yourself. skills.sh has a CLI (npx skills add <owner/repo>). LoopSkill has a one-command curl installer that pulls a signed, versioned tarball directly into your agent''s skills directory, plus MCP tools (loopskill_install, loopskill_bundle_install) an agent can call itself without you typing anything.'
  - q: 'What is a "bundle" and does any other directory have it?'
    a: "A bundle is a named, versioned collection of skills installable as a single command -- e.g. dev-agent-essentials (3 skills) or research-and-report (3 skills). Of the six other sites compared here, none offer curated multi-skill install bundles; they list individual servers or skills one at a time."
  - q: 'Which directory should I trust for "most popular" skills?'
    a: "skills.sh publishes an actual install-count leaderboard, which is the closest thing to a real popularity signal in this space. awesome-mcp-servers' 92,629 GitHub stars is a different, slower-moving popularity signal (curation effort and social proof, not install telemetry). Neither LoopSkill nor most MCP-server directories publish install leaderboards today."
---

If you searched for this, you already know the problem: there are now half a dozen places that call themselves "the" directory for MCP servers or agent skills, and none of them agree on what they index or how big they are. This is a straight comparison of the ones that actually exist and work today, checked live in August 2026.

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

[punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) is the canonical GitHub "awesome list" -- 92,629 stars as of this writing, hand-curated, no install tooling of its own. It's a plain markdown list you Ctrl-F through. No install command, no search API, no quality score -- just links, organized by category, maintained by community PRs. If you want the social-proof version of "what's popular," a 92k-star awesome list is a stronger signal than any directory's own install counter, precisely because GitHub stars are a cost the submitter didn't control. Note this is a star count, not a skill or server count -- the two are not directly comparable to Glama's 75,783 or LoopSkill's federation total below, and we're calling that out rather than letting the numbers sit side by side unremarked.

### LoopSkill

[LoopSkill](https://app.loopskill.io) is what we run. The number that matters here is how much is actually reachable through one install path, not who wrote any given entry: LoopSkill's federation index currently reaches 91k+ skills, pulled live from multiple upstream registries -- see [/federation/](/federation/) for the current count, since it moves daily and we're not printing a fixed figure in an article that won't update. That's metadata, not rehosted content: name, description, source, a trust/license signal, and a link back to the original listing (LoopSkill's own [federation docs](/federation/) are explicit that federated entries are indexed, not mirrored).

A hosted MCP server exposes 47 dedicated tools over StreamableHTTP (`https://app.loopskill.io/api/mcp/http/`, point any MCP client at it with an API key) for search, install, publish, and fleet management across that whole reachable set -- not a generic REST wrapper bolted onto a website.

What's genuinely different about LoopSkill versus the sites above:

- **Search reach plus a real install path in one tool.** The other six directories above are browse-and-link (or browse-and-clone); LoopSkill's MCP server and one-command installer work against the same federation index you can search, so "find it" and "install it" are one step for an agent, not two.
- **A working one-command installer**, not just a link to a repo: `curl -fsSL https://app.loopskill.io/install.sh | bash -s -- <slug>` pulls a versioned, signed tarball straight into your agent's skills directory for anything hosted directly. Verified live for this article -- see the [how-to piece](/blog/share-claude-skills-between-agents) for the full transcript.
- **Bundles** -- named collections of skills with version pins, installable as one line (`curl -fsSL https://app.loopskill.io/api/bundles/install.sh | bash -s -- <bundle-slug>`), which none of the six directories above have; they list individual servers/skills, not curated stacks you install as a unit.
- **Cryptographic verification on what's hosted directly**: every skill published to LoopSkill is Ed25519-signed by its creator at publish time and verified cryptographically at install, with the signature, tarball SHA-256, and source commit stamped on the public skill page -- see [Security & audit](/security). That guarantee covers the hosted subset, not the federated metadata layer, and we're not blurring the two.
- **Sandboxed pre-publish verification**: every hosted skill runs in an ephemeral, network-restricted container before it goes live, and the runner records every syscall/fetch/write for review -- a step none of the other six directories describe doing.
- **Runnable loops**: bounded, POST-and-get-a-pass/fail agentic routines, which is a different category from "browse and install" entirely and doesn't really compare to any directory here.

What LoopSkill is honestly behind on:

- **Community and track record.** No public leaderboard like skills.sh's install counts, no 92k-star GitHub list like awesome-mcp-servers, and no multi-year editorial history like PulseMCP's newsletter. We're not claiming otherwise, and we're not going to invent a user count to paper over it.
- **MCP-server auth handling.** Smithery's one-click OAuth connectors for third-party SaaS solve a real problem LoopSkill doesn't specifically target -- LoopSkill's model is signed, versioned code artifacts your agent runs locally, not managed live sessions against someone else's API.
- **Verified coverage of the full index.** The 91k+ federation number is search reach, sourced as metadata from upstream registries -- it is not 91k skills LoopSkill has individually sandboxed, signed, or hosted. If you need the cryptographic guarantees, that applies to the hosted subset at [/skills](/skills), not the whole federated number.

## Which one should you actually use

- Want the single biggest net to search across every public MCP server? **Glama.**
- Want a one-click, credential-managed connector to a specific SaaS tool? **Smithery.**
- Want to know what's actually being installed and by whom, for skills specifically? **skills.sh's leaderboard.**
- Want the community's own hand-curated "these are good" list, weighted by GitHub stars? **awesome-mcp-servers.**
- Want editorial context and news on where MCP itself is heading? **PulseMCP** (when submissions reopen).
- Want to search 91k+ skills across the ecosystem from one MCP server and install straight into your agent, with cryptographic verification on what's hosted directly? **[LoopSkill](https://app.loopskill.io)** -- see the live count at [/federation/](/federation/) and [pricing](/pricing).

These aren't mutually exclusive. If you're building an agent stack today, the realistic answer is: use LoopSkill's federation search when you want the whole ecosystem reachable from one MCP server, and skills.sh for install popularity signal; use Glama or Smithery when you need a specific MCP server for a specific SaaS integration; and keep an eye on awesome-mcp-servers and PulseMCP for what the wider ecosystem is converging on.

[Search the federation index](/federation/) &middot; [Browse the LoopSkill catalog](/skills) &middot; [Pricing](/pricing)
