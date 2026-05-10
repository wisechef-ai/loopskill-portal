---
title: 'Recipes — vertical skill marketplace for AI agents (a 30-day report)'
description: 'Architecture, trust model, economics, and real numbers from 30 days of running a production skill marketplace for AI agencies. FastAPI + MCP + ed25519 + cognee. No marketing fluff.'
pubDate: 2026-05-10
author: 'WiseChef'
tags: ['recipes', 'skills', 'marketplace', 'mcp', 'architecture']
---

## 1. Why this exists

AI agents are getting good at tool use. The problem is provisioning the tools. Every agency that runs Claude Code, Cursor, or Windsurf ends up maintaining a bespoke collection of scripts, SKILL.md files, and brittle shell one-liners that each engineer assembled independently. There is no canonical place to find a vetted, installable, versioned skill that works across agent hosts.

The Anthropic Skills standard changed that in early 2026. It gave the ecosystem a shared metadata shape — frontmatter in SKILL.md, a YAML allowlist manifest, a defined install handshake — so that any compliant agent host could load a skill without bespoke glue. What it did not provide was a catalog. Something had to fill that gap.

Recipes is that catalog. It exists because WiseChef was already running production agent workloads for marketing and SEO agencies, accumulating skills that solved real problems (client reporting, content calendar automation, semantic SEO auditing, proposal generation), and there was no good way to share them across clients or publish them for others to reuse. The marketplace is a side-effect of internal necessity: once you have 40 skills that work, the infrastructure cost of publishing them is marginal.

The "missing layer" between the Anthropic Skills spec and actual deployed agents is trust, distribution, and economics. You need a pipeline that reviews skill quality and security, a hosting layer that makes install commands short, and a revenue model that incentivizes creators to publish real, maintained skills instead of toy examples. That is what this report is about.

## 2. The Anthropic Skills standard primer

A skill in the Anthropic Skills ecosystem is a directory with a `SKILL.md` file at its root. The frontmatter of that file is the skill's identity card. It carries fields like `slug`, `version`, `tier` (which maps to the billing gate), `allowlist` (the list of domains and endpoints the skill is permitted to contact), and `mcp` (whether the skill exposes an MCP server endpoint). An agent host reads this frontmatter, validates the allowlist against its own policy, and decides whether to install.

The allowlist manifest is the security boundary. A skill that claims to do client reporting should only need to reach the client's analytics API and maybe a PDF renderer — nothing else. If the manifest lists `api.stripe.com` and the skill description says "SEO audit", a compliant agent host will refuse to install it. This is not a suggestion; it is the handshake.

YAML drives the rest of the skill definition: dependencies, environment variables it expects, the command it runs, and the MCP server spec if applicable. The install command (`npx @wisechef/recipes-skill install <slug>`) pulls this manifest from the Recipes API, resolves dependencies, writes environment scaffolding, and registers the skill with the agent host in one step.

The key insight is that the standard makes skills *portable*. A skill published to Recipes works on Claude Code, Cursor, Windsurf, Cline, OpenClaw, and Hermes without modification — as long as those hosts implement the same handshake. The standard is the interoperability layer; Recipes is the distribution layer.

## 3. Why vertical (agencies-only) vs. horizontal

A horizontal marketplace serves everyone: developers, students, researchers, hobbyists, enterprises. It maximizes top-of-funnel reach and minimizes addressable depth. The economics of horizontal marketplaces favor breadth: list everything, charge nothing (or almost nothing), monetize at scale.

We chose vertical on purpose. The target audience is AI agencies: small teams (2-20 people) that run agents as a service for clients in marketing, SEO, content, sales ops, and adjacent fields. This audience has three properties that make vertical economics work.

First, they have real workflows with real pain. A content agency running weekly blog audits for 30 clients does not want a general-purpose "web scraper" skill. They want a skill that fetches a client's sitemap, runs semantic similarity scoring against their competitors' top pages, and outputs a ranked gap report in the format their account manager already uses. The specificity is the value.

Second, they have real budgets. Agencies bill clients. A skill that saves an account manager 3 hours a week is worth $60-150/month in reclaimed billable time. A $20/month Pro subscription is a rounding error. The conversation is not "can I afford this" — it is "which skills will I use this week."

Third, they have fleet deployment needs. A 10-person agency where every operator runs Claude Code needs to provision the same skills across 10 seats, keep them synchronized, and audit what each seat has installed. That is a Pro+ problem ($100/month for 20 endpoints with fleet sync), not a problem that a one-size-fits-all free tier solves.

Staying vertical means we can price for real value, support real workflows, and build a creator community that publishes real skills instead of toy examples.

## 4. Architecture

The backend is a FastAPI application running on port 3360, reverse-proxied by Caddy. Postgres (pghybrid, port 5433) is the source of truth for skills, users, subscriptions, and install counts. Cognee 1.0.5 runs as a sidecar service, providing the knowledge graph and pgvector-backed semantic recall that powers the `super-memory` gateway skill.

Skill publishing runs through `publisher_routes.py`, specifically the `POST /api/skills/publish` endpoint (lines 148-431 in the current build). This route handles intake: it receives a skill archive, validates frontmatter, runs the 5-step quality pipeline (security scan, discipline check, quality score, allowlist validation, manifest integrity), signs the artifact with ed25519, and writes the result to both Postgres and the file store. A successful publish returns a signed skill ID that the install command can verify.

The MCP server (`app/mcp/server.py`) exposes the catalog over the Model Context Protocol. Agent hosts that implement MCP discovery can enumerate the catalog programmatically — useful for agents that want to self-provision skills based on the task at hand rather than waiting for a human to run an install command. The MCP server respects the same tier gating as the REST API.

Auto-publish works via a cookbook propagation pipeline: internal WiseChef production workloads that have been running successfully for 30+ days are eligible for automatic skill extraction. A weekly cron job reviews production workflow telemetry, identifies stable tool call patterns, and opens a draft skill PR against the Recipes catalog. A human reviews and merges. This is how the catalog grew to 54 skills in 30 days without a manual submission process.

Install count tracking is a separate concern. `install_count_drift_probe.py` runs hourly via cron. It cross-references the install event log against the `install_count_total` column in Postgres and reconciles any drift — this matters because distributed installs from multiple agent hosts can arrive out-of-order and race against each other. In the last 7 days (as of 2026-05-10), drift probe has reported 0 discrepancies.

## 5. Trust model

Skill trust is two-stage. Any GitHub account can open a PR against the Recipes catalog. That PR lands as a **draft skill** — visible in the catalog with a `draft` badge, installable by opt-in testers, but not surfaced in search or the default skills list. Draft status persists until a human reviewer approves it.

The 5-step quality pipeline runs on every PR and every update to a published skill:

1. **Security scan** — static analysis for known malicious patterns (exfiltration, credential harvesting, prompt injection attempts in SKILL.md descriptions).
2. **Discipline check** — does the skill do what it says? Does the allowlist match the actual network calls the skill makes? Automated sandboxed execution with network traffic logged.
3. **Quality score** — documentation completeness, test coverage, error handling presence. A skill with no tests and a one-line description scores below the publish threshold.
4. **Allowlist validation** — every domain in the allowlist must be resolvable and must match the skill's stated purpose. An allowlist entry for `login.microsoftonline.com` on a "CSV formatter" skill fails this check.
5. **Manifest integrity** — the SKILL.md frontmatter must parse cleanly, required fields must be present, version must follow semver.

Skills that pass all 5 steps are signed with an ed25519 key pair. The public key is pinned in the Recipes CLI. The install command verifies the signature before writing anything to disk. A skill whose signature does not verify is refused, even if it came from recipes.wisechef.ai.

The two-stage model means the catalog has no "upload and go live" path. It also means creators who invest in quality get faster human review turnaround — we track review latency and prioritize skills that enter the pipeline with a clean quality score.

## 6. Pro / Pro+ economic model

Pricing is live as of 2026-05-10:

- **Pro** — $20/month, 1 seat, full access to all 38 Pro-tier skills (labeled `cook` in the DB, `Pro` in the UI after the rev7.3 label rename).
- **Pro+** — $100/month, 20 agent endpoints, fleet sync, full access to all 14 Pro+ skills (labeled `operator` in the DB, `Pro+` in the UI).
- **Free** — 2 skills permanently free (including `super-memory`). No credit card required.

The referral model pays **50% recurring** on every subscriber a creator refers. A creator who refers 10 Pro subscribers earns $100/month recurring, indefinitely, as long as those subscribers stay active. This is not a one-time bounty; it is a revenue share. The mechanics: the referred user signs up with a `?ref=<code>` link, which sets a 30-day cookie at the Caddy edge. If that user subscribes within 30 days, the referral is attributed.

Current subscription state (verified 2026-05-10): 7 total users, 0 paid subscribers. 3 internal users (chef@, tori@, adam.krawczyk0698@gmail.com) on $0 Co-worker pricing. 4 external signups (adam-krawczyk@outlook.com, hello@agentforgelabs.com, team@wisechef.ai, wise@wisechef.ai) — all currently on the free tier. The goal for the next 30 days is the first 5 paid conversions.

The DB slug vs. display label distinction matters for API consumers. The REST API returns `tier: "cook"` and `tier: "operator"` — these are stable identifiers that will not change. The portal UI displays "Pro" and "Pro+" respectively. The rev7.3 commit (feat(pricing): label rename Cook→Pro, Operator→Pro+) updated only display strings; the underlying model is unchanged.

## 7. The skill creator deal

Publishing a skill to Recipes is free. There is no listing fee, no revenue split on the skill itself (skills are not sold individually; they are part of the subscription catalog). What creators earn is the referral revenue share.

The creator deal, explicitly:

- **Free to publish.** Submit a PR. Pass the 5-step pipeline. Get your skill in the catalog.
- **50% recurring revenue share.** Your skill page on recipes.wisechef.ai has your referral code baked in. Every user who discovers your skill, clicks through, and subscribes within 30 days generates 50% of their subscription fee for you, every month, for as long as they stay subscribed.
- **First 100 creators** who publish an approved skill get permanent featured placement in the catalog — a `featured` badge and priority in search ranking. This is not a time-limited promotion; it is permanent for the first 100 slots.
- **Chef→Recipes pipeline.** If your skill consistently performs well in the WiseChef production workload, it gets nominated for the auto-publish pipeline, which means WiseChef's own agent infrastructure tests and validates your skill at production scale.

The economics make sense for creators who build skills that solve real agency problems. A skill that 50 agencies install generates 50 referral chains. If 10 of those agencies subscribe to Pro ($20/month), the creator earns $100/month recurring — from one skill, indefinitely. Skills that solve narrow, real problems with good documentation and active maintenance compound over time.

## 8. What we learned in 30 days

Numbers first, verified as of 2026-05-10:

- **54 skills** in the catalog total.
- **38 Pro-tier** (cook slug), **14 Pro+ tier** (operator slug), **2 Free**.
- **7 users** — 3 internal, 4 external. 0 paid.
- **0 install count drift** in the last 7 days (install_count_drift_probe.py, hourly cron).
- Architecture stable: FastAPI 3360 + Caddy + Postgres pghybrid:5433 + cognee 1.0.5.

The most significant product decision in the 30 days was the tier label refactor. The original labels were "cook" and "operator" — meaningful internally (cook = someone who uses skills, operator = someone who deploys them at scale) but confusing externally. Prospect after prospect read "operator" and assumed it meant something about their role in their own organization, not the scale of their agent deployment. The rev7.3 rename to "Pro" and "Pro+" reduced that confusion immediately: the first external signup after the rename did not ask what "operator" meant.

The technical lesson was that display strings and DB identifiers must be explicitly decoupled from day one. We now have a translation layer in the portal that maps DB slugs to display labels, and the API contract explicitly documents that `cook` and `operator` are stable identifiers. Any future rename (if we ever need one) touches only the translation layer.

The install count drift probe surfaced one interesting edge case: agent hosts that queue install events and flush them in batches can produce out-of-order timestamps in the event log. The probe handles this with a 5-minute settlement window before reconciling — events within 5 minutes of "now" are considered in-flight and skipped. This eliminated false-positive drift alerts.

The quality pipeline's discipline check has been the most valuable gate. Three of the first ten external skill submissions failed the allowlist-vs-actual-traffic check — skills whose stated allowlist was narrower than what they actually called at runtime. All three were honest mistakes (developers testing against localhost, forgetting to add their actual API domain). The check caught them before they hit the catalog. One submission failed the security scan for prompt injection patterns in the skill description — an edge case we did not anticipate but are glad the scanner caught.

## 9. What's next

The Chef→Recipes auto-pipeline is the near-term priority. WiseChef's production workloads generate tool call telemetry that is already being logged. The pipeline that converts stable telemetry patterns into draft skill PRs is built and tested; what remains is the human review interface — a lightweight dashboard where a Recipes maintainer can approve, reject, or edit a draft skill that the pipeline surfaced.

The goal is weekly skill PRs from production WiseChef workloads. If the workload telemetry shows a stable, high-frequency tool call pattern (same sequence of API calls, same input/output shape, used at least 5 times in 7 days), the pipeline extracts a skill template, populates frontmatter, generates a test fixture from real inputs, and opens a PR. A human reviews, adjusts if needed, and merges. This should add 5-10 new skills per month without any manual skill authoring.

The second priority is the first paid conversion. The 4 external free users are the target. The `super-memory` free skill is explicitly designed as a conversion funnel: it works, it is useful, it demonstrates the install UX, and it surfaces the Pro catalog naturally. The follow-up sequence after a `super-memory` install is: 7-day email with Pro skill suggestions relevant to the user's agent host, 14-day email with install count for their `super-memory` install (social proof), 21-day Pro trial offer.

Fleet sync for Pro+ is the third near-term item. Currently, a Pro+ subscriber can create 20 endpoint slots, but the sync mechanism (push a skill update to all endpoints simultaneously) is manual via API call. The goal is a one-command fleet sync: `recipes fleet sync` reads the subscriber's endpoint list, diffs installed skill versions against the latest catalog, and pushes updates to all endpoints in parallel.

## 10. How to get started

Three paths, depending on what you want to do:

**Evaluate:** Install `super-memory` free. It takes 60 seconds, requires no account, and demonstrates the full install UX including allowlist validation and signature verification. The command is on the skill page: [recipes.wisechef.ai/skills/super-memory](https://recipes.wisechef.ai/skills/super-memory).

**Subscribe:** Browse the full catalog at [/skills](https://recipes.wisechef.ai/skills). Skills are filterable by category, tier, and agent host compatibility. The pricing page at [/pricing](https://recipes.wisechef.ai/pricing) has the current USD prices and a comparison of Pro vs. Pro+. The install docs at [/docs/install](https://recipes.wisechef.ai/docs/install) cover per-agent-host setup for Claude Code, Cursor, Windsurf, Cline, OpenClaw, and Hermes.

**Publish:** Read the publishing docs at [/docs/publishing](https://recipes.wisechef.ai/docs/publishing). The SKILL.md spec, the 5-step pipeline criteria, and the allowlist format are all documented there. Open a PR against the Recipes catalog. The pipeline runs automatically on PR open. Expected first review within 48 hours for skills that score above the quality threshold.

The catalog is 54 skills on day 30. The auto-pipeline target is 60+ by day 60. If you build something real, submit it.
