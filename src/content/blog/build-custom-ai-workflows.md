---
title: "Build Custom AI Workflows Without Code"
description: "You don't need a Python developer to automate your agency. Proposal Builder generates custom proposals from your templates in 30 minutes — not 6 hours."
pubDate: 2026-05-02
author: "Adam Krawczyk"
tags: ["proposals", "automation", "no-code", "agencies", "workflows"]
skill: "proposal-builder"
---

## The Proposal Bottleneck

Proposals are how agencies win business. But writing them is a bottleneck:

- Copy-paste from the last proposal
- Update the client name, scope, and pricing
- Find the right case study
- Customize the timeline
- Format everything in Google Docs or InDesign
- Export to PDF
- Send

Each proposal takes 4-6 hours. If you send 5 per month, that's 20-30 hours — three full work days — just on proposals.

## Proposal Builder

Proposal Builder is a WiseChef skill that turns your proposal template + client briefing into a finished proposal. Here's the workflow:

### 1. Set up your template

Create a proposal template with your branding, standard sections, and placeholders:

```markdown
# Proposal for {{client.name}}

## Executive Summary
{{ai.generate_brief_summary}}

## Proposed Scope
{{ai.generate_scope_from_briefing}}

## Timeline
{{ai.generate_timeline}}

## Investment
{{pricing_table}}

## Why Us
{{ai.select_case_studies count=3}}
```

### 2. Feed it a briefing

```bash
proposal-builder generate \
  --template="agency-v2" \
  --briefing="Client is a SaaS company doing $2M ARR looking for paid media management. 6-month engagement, $5K/month budget." \
  --client="Acme SaaS"
```

### 3. Review and send

Proposal Builder generates a complete proposal with:

- Custom executive summary based on the briefing
- Scoped deliverables matched to the client's industry and goals
- Realistic timeline with milestones
- Your standard pricing, adjusted for scope
- Three relevant case studies selected from your library

You review it in 30 minutes and send.

## The AI Doesn't Write From Scratch

Important: Proposal Builder doesn't hallucinate content. It works from *your* templates, *your* case studies, and *your* pricing. The AI handles the customization — picking the right sections, filling in client-specific details, and selecting matching case studies.

The result is a proposal that sounds like your agency wrote it — because it did. The AI just did the assembly.

## Setup Time

Most agencies are up and running in under an hour:

1. Import your existing proposal template
2. Add your case studies (titles, verticals, results)
3. Set your pricing structure
4. Generate your first proposal

## Installation

```bash
pipx install wiserecipes
wiserecipes install proposal-builder
```

Proposal Builder is available on the Operator tier ($25/month).

---

*Proposal Builder is one of 80+ AI agent skills in the WiseChef library. [Browse all skills](/library).*
