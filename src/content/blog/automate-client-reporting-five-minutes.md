---
title: 'How to automate client reporting in 5 minutes'
description: 'Stop spending Friday afternoons building client reports. Install one Recipes skill, point it at your data, and get branded PDFs on a schedule -- without writing a line of code.'
pubDate: 2026-05-11
author: 'WiseChef'
tags: ['client-reporting', 'automation', 'agencies', 'seo', 'gohighlevel']
---

Every agency knows the drill. Friday afternoon. Five client reports due by 5 PM. You are copy-pasting numbers from Google Analytics, screenshots from GoHighLevel, and campaign metrics from Meta Ads into a Google Slide template that has not been updated since Q2.

It takes 45 minutes per client. With ten clients, that is your entire Friday.

The Client Reporter skill on Recipes kills this workflow dead.

## What it does

Client Reporter is a free Recipes skill that connects to your data sources (Google Analytics, GoHighLevel, Meta Ads, Google Search Console) and generates a branded client report in under 60 seconds. Not a dashboard. A report -- the thing your clients actually read.

You run one command:

```
recipes install client-reporter
recipes run client-reporter --client "Acme Corp" --period "last-7-days"
```

The skill pulls the data, formats it into your branded template, and outputs a PDF. You can schedule it with cron, a GitHub Action, or whatever automation layer you already use.

## Why it is free

Client Reporter is Recipes' gateway skill. It works fully, forever, at no cost. The idea is simple: if automating one report saves you three hours per week, you will want to automate the rest of your operations. That is what Recipes Pro is for -- the full catalog of 50+ skills for agencies who want to run their entire stack through agent commands.

## The reporting pipeline

Here is what Client Reporter does under the hood:

1. **Data collection** -- Connects to your configured integrations via OAuth tokens stored in your agent's environment. No data leaves your infrastructure.

2. **Metric extraction** -- Pulls the KPIs that matter: traffic, conversions, cost, ROAS, keyword rankings. Configurable per client.

3. **Narrative generation** -- An LLM pass writes the commentary ("Organic traffic up 23% week-over-week, driven by the blog post on tenant screening laws published Tuesday"). This is where most agencies see the biggest time savings -- not the charts, but the written analysis.

4. **Template rendering** -- Drops everything into your branded HTML template and exports to PDF.

5. **Delivery** -- Emails the PDF to your client, or pushes it to a shared drive, or both.

## Scheduling for zero-touch

The real magic is scheduling. Set it once and forget it:

```bash
# Weekly report every Friday at 3 PM
recipes schedule client-reporter \
  --client "Acme Corp" \
  --period "last-7-days" \
  --cron "0 15 * * 5" \
  --deliver email:client@acme.com
```

Your client gets a professional report in their inbox every Friday at 3 PM. You did zero work.

## GoHighLevel integration

If you are running GoHighLevel for your clients (and most agencies doing local SEO are), Client Reporter pulls pipeline data, appointment stats, and campaign performance directly from the GHL API. No manual exports. No CSV wrangling.

The integration works through the standard GHL API key. You set it once per client sub-account, and the skill handles pagination, rate limits, and data normalization automatically.

## Getting started

1. Install Recipes: `npm install -g @recipes/cli`
2. Install the skill: `recipes install client-reporter`
3. Configure your first client: `recipes config client-reporter --setup`
4. Run it: `recipes run client-reporter --client "Your Client" --period "last-7-days"`

That is it. Five minutes from install to your first automated report.

[Install Client Reporter](https://recipes.wisechef.ai/skills/client-reporter)
