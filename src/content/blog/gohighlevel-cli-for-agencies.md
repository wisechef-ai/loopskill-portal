---
title: "GoHighLevel CLI: Command-Line Power for Agency Operators"
description: "Manage your GoHighLevel sub-accounts, contacts, pipelines, and campaigns from the terminal. No more clicking through 17 menus to update a pipeline stage."
pubDate: 2026-05-02
author: "Adam Krawczyk"
tags: ["gohighlevel", "agencies", "cli", "automation"]
skill: "gohighlevel-cli"
---

## GoHighLevel Is Powerful. The UI Is Not.

If you run an agency on GoHighLevel, you already know: the platform can do almost anything. But doing *simple things* — like moving 50 contacts between pipelines, or updating a custom field across 200 records — means clicking through menus, applying filters one at a time, and praying the bulk action doesn't time out.

GoHighLevel CLI fixes that. It's a WiseChef skill that gives you terminal access to your GHL instance.

## What You Can Do

**Contact management:**
```bash
# Search contacts by tag
ghl contacts list --tag="hot-lead" --location="loc_abc123"

# Bulk update custom fields
ghl contacts update --field="status" --value="qualified" --filter="tag:hot-lead"

# Move contacts between pipelines
ghl opportunities move --pipeline="Sales" --stage="Closed Won" --filter="value>5000"
```

**Campaign control:**
```bash
# List all campaigns
ghl campaigns list

# Pause a campaign
ghl campaigns pause --id="camp_xyz"

# Add contacts to a campaign
ghl campaigns enroll --id="camp_xyz" --contacts="contact_1,contact_2,contact_3"
```

**Sub-account operations:**
```bash
# Switch between sub-accounts
ghl use --location="client_a"

# Get account stats
ghl stats --period="30d"
```

## Why Command Line?

Three reasons:

1. **Speed** — A 50-contact pipeline update takes 2 seconds in the terminal vs. 10 minutes of clicking.
2. **Scriptability** — Chain commands into workflows. `ghl contacts list --tag="new" | ghl campaigns enroll --id="onboarding"` becomes a cron job.
3. **Auditability** — Every command is logged. You know exactly what changed, when, and why.

## Installation

```bash
pipx install wiserecipes
wiserecipes install gohighlevel-cli

# Configure your API key (from GHL Settings > API)
ghl config set --api-key="your_key" --location="your_location_id"
```

GoHighLevel CLI is available on the All-in tier (€100/month).

## Pro Tips

- **Use `ghl use` to switch contexts** — if you manage multiple GHL sub-accounts, this is faster than logging in and out of the web UI.
- **Pipe to `jq` for filtering** — `ghl contacts list | jq '.[].email'` gives you a clean email list.
- **Automate with cron** — Schedule pipeline cleanups, contact enrichment, and campaign enrollment to run automatically.

---

*GoHighLevel CLI is part of the WiseChef All-in tier. [Get started](/signin?next=/api/checkout/studio).*
