---
title: 'One private skill bundle per client, the same on every machine'
description: 'Per-client agent skills drift once you work on more than one machine. We reproduced a fix on Debian x86_64 and macOS arm64 on 2026-10-11: one private bundle per client, one install command per machine, identical folders on both.'
pubDate: 2026-10-11
author: 'WiseChef'
tags: ['claude-code', 'skills', 'bundles', 'agencies', 'how-to']
---

If you run coding agents for several clients, you probably keep per-client skills: conventions, brand voice, runbooks. On one machine that is fine. On two, the copies drift. Maksym Prokopov [put it plainly](https://prokopov.me/posts/skillsync-reusing-ai-agent-skills/) (2026-05-11): "Or I improve a project skill on my MacBook and later discover that the Linux box still has the old version."

## First: you may not need us

- **Comfortable with git?** A private dotfiles repo plus symlinks, or a free open-source tool such as claude-sync, gaal or chezmoi, solves cross-machine sync at no cost.
- **Material not confidential?** Use a public bundle. Public bundles are free and unlimited on every tier.
- **Material secret?** Self-host LoopSkill (free, MPL-2.0) so the bundles live on a server you run.

Hosted private bundles are for the middle: private but not secret, on 2 or more machines, without maintaining a repo or running a server. One bundle per client, tarballs downloaded through signed URLs, each checked by its sha256, one install command per machine.

## What we reproduced (2026-10-11)

One Free account, one API key, two machines: Debian 13 x86_64 with Python 3.12, and macOS 27 arm64 with Python 3.9 and the standard library only.

- A client bundle with 3 skills installed in 1.28 s on one machine and 1.33 s on the other. The folder fingerprint was `72d57592…` on both: identical.
- We added a skill from the first machine, then re-ran the install on the second: 3 kept, 1 added, 0.97 s. Fingerprint `169062a9…` on both.
- The same API key ran on both machines at the same time (6 of 6 concurrent calls OK). You do not need a key per machine.
- Removing the 4 skill folders and the lockfile left nothing behind.

One thing that surprised us: `loopskill_sync` does not update a machine. It moves the bundle's pinned versions on the server (loopskill-api#400). Re-running the install is what updates a machine.

## How to set it up

Sign in yourself ([sign in](/signin?next=/library&utm_source=blog&utm_medium=blog&utm_campaign=uc-per-client)). Your Library shows the API key we generated when you signed up, once; if you already closed that reveal, create or revoke keys on your Account page. Give the key to your agent. Do not let the agent register its own key for this: an agent-registered key is denied checkout by design, so that account can never be upgraded.

Then the agent does two different things. Create the bundle once, on the first machine only, and note its id: every compose call makes a new bundle, so composing again on a second machine would make a duplicate (and on Free can hit the cap). Then install it on every machine, including the first, from that id; to update a machine, re-run the install there. To add a skill, add it to the bundle once, then re-run the install on each machine.

The full copy-paste instruction for your agent, the cap message and when Pro is worth it are on the [use-case page](/use-cases/one-private-bundle-per-client/?utm_source=blog&utm_medium=blog&utm_campaign=uc-per-client).

## The cap

Free includes 2 private bundles and 1 API key. The Liked bundle is private and is created when you first open your Library, so it uses one of the 2 slots: in practice, one client bundle on Free. Pro $9.95/mo: 50 private bundles, 10 API keys. The 10 keys are for revoking one machine or one client separately, not a requirement.

One client bundle is enough (your Liked list takes the other Free slot), and you only put catalog skills in it? Stay on Free.

A few little-used hosted endpoints (skill forks, draft-to-skill, sync streaming and some others) also require Pro; don't buy it for those, they may be retired.
