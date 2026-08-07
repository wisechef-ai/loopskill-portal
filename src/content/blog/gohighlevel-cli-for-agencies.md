---
title: 'GoHighLevel CLI for agencies -- control your entire stack from the terminal'
description: 'GoHighLevel is powerful but its UI is slow. Recipes gives your AI agent a CLI interface to GHL -- pipelines, contacts, campaigns, and reporting, all from one command.'
pubDate: 2026-05-11
author: 'WiseChef'
tags: ['gohighlevel', 'cli', 'agencies', 'automation', 'recipes']
---

GoHighLevel is the operating system for marketing agencies. Pipelines, contacts, campaigns, funnels, calendars, reputations -- it does everything. But doing everything through the GHL dashboard is like writing a novel in Google Docs with your mouse. Possible. Painful.

Recipes' GoHighLevel skill turns GHL into a command-line tool. Your AI agent (Claude Code, Cursor, Windsurf, or any Anthropic Skills-compatible host) can now manage your entire GHL stack from the terminal.

## The problem with dashboards

Here is a typical agency morning:

1. Log into GHL sub-account for Client A. Check pipeline. Move three deals to "Won." Assign follow-up tasks.
2. Switch to Client B. Review campaign performance. Pause the underperforming ad set. Update the email sequence.
3. Switch to Client C. Export contacts from last week's webinar. Tag them. Enroll in nurture sequence.
4. Repeat for twelve more clients.

That is two hours of clicking. Every single morning.

The GHL API exists, but nobody wants to write curl commands or Python scripts for routine operations. You want to say "move all deals in the proposal stage that have been sitting for more than 3 days to lost" and have it happen.

## How the Recipes GHL skill works

```
recipes install gohighlevel
recipes config gohighlevel --api-key YOUR_KEY --sub-account CLIENT_SUB
```

Now your agent can do this:

```
recipes run gohighlevel --action pipelines --list
recipes run gohighlevel --action contacts --tag "webinar-attendee" --enroll "Nurture Sequence"
recipes run gohighlevel --action deals --stage "proposal" --older-than "3d" --move-to "lost"
```

Every GHL API endpoint is exposed as a CLI action. Pipelines, contacts, opportunities, campaigns, funnels, calendars, conversations, tasks, tags, custom fields, forms, surveys -- all of it.

## Real agency workflows

### Batch client onboarding

New client signed? One command sets up everything:

```
recipes run gohighlevel \
  --action onboard \
  --template "agency-standard" \
  --pipelines "Sales,Delivery" \
  --calendars "Discovery,Onboarding" \
  --tag "new-client-2026-Q2"
```

### Weekly pipeline review

Generate a pipeline health report for all sub-accounts without opening a single dashboard:

```
recipes run gohighlevel \
  --action pipeline-report \
  --all-sub-accounts \
  --period "last-7-days" \
  --format markdown
```

### Contact segmentation

Tag and segment contacts based on behavior:

```
recipes run gohighlevel \
  --action segment \
  --source "facebook-lead-ad" \
  --tag "fb-lead" \
  --enroll "Facebook Lead Nurture"
```

## Why CLI beats dashboards

Speed is the obvious answer. But the real advantage is composability.

When your GHL operations are CLI commands, they become scriptable. You can chain them, schedule them, version-control them, and share them across your team. An SOP becomes a script instead of a 12-step Notion doc with screenshots.

More importantly, your AI agent can execute these commands. You do not need to remember the exact GHL API parameters for creating a custom field. You tell your agent "add a custom field called HVAC System Type to the Acme account" and it figures out the API call.

## Security model

The GHL skill uses your existing API key. Credentials are stored in your agent's environment, not on Recipes servers. The skill is open-source and auditable. Recipes is a distribution layer, not a proxy -- your data flows directly between your agent and GoHighLevel's API.

## Pricing

The GoHighLevel skill is part of Pro, then priced at $29/month — that figure is superseded; the current ladder is Free / Pro $9.95 per month / Enterprise on demand (see [/pricing](/pricing)). It includes access to the full skill catalog -- client reporting, SEO auditing, proposal generation, content calendar management, and 50+ other agency skills. The free tier includes Client Reporter and super-memory as gateway skills.

[Install the GoHighLevel skill](https://recipes.wisechef.ai/skills/gohighlevel)
