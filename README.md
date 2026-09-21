# weekly-reporting-automated-task

🇲🇽 [Leer en español](README.es.md)

Automated weekly ad-performance reporting for **an auto-repair shop**, a preventive-maintenance auto shop in Monterrey, Mexico. Every week, an autonomous Claude Code routine pulls live creative-level performance data straight from Meta Ads, cross-checks it against the client's own messaging-inbox data, writes an actual analysis of the week (not a templated summary) in the operator's own voice, and delivers it as a ready-to-review Gmail draft.

## What it does

1. **Pulls live data** — day-by-day, creative-by-creative spend, impressions, conversions and reach/frequency for every active campaign on the ad account, via Meta's official Ads MCP connector (no long-lived API key involved), plus a real conversation count from the client's messaging inbox (`fetch_chatwoot_ad_conversations.js`) to cross-check Meta's own numbers.
2. **Analyzes it** — an LLM writes the actual findings each week across five angles: reconciliation against the real inbox count, which creatives are winning or losing efficiency, performance by format/copy angle, which day of the week performs best, and whether the account's current audience targeting is saturating (reach flattening while frequency climbs). This is judgment, not a fill-in-the-blanks template. See [`README.es.md`](README.es.md) for the exact metric corrections this step must never violate (budget lives at campaign/ad set level, never per ad; "conversation started" means a message was actually sent, not just that the chat app opened; Meta can over-count at the edges of a reporting window).
3. **Writes it for the decision-maker** — first person, plain language, no corporate framework-speak, a small table backing up each numeric claim instead of one giant table at the end, closing with concrete decisions to propose rather than a restated summary.
4. **Delivers it safely** — the HTML summary becomes a Gmail **draft** addressed to the operator, never auto-sent and never addressed directly to the decision-maker. A human always reviews before it goes anywhere.
5. **Runs on a schedule** — a cron-triggered cloud agent does all of the above unattended, then pings the operator with a push notification once the draft is ready (or with the specific error if something failed, instead of a half-built report).

## Why this exists

Manually pulling Ads Manager exports and writing a weekly performance summary is repetitive, easy to skip, and easy to do inconsistently — and Meta's own dashboard numbers can be misleading (inflated at the edges of a date range, or counting the wrong thing entirely). This turns it into a standing, judgment-driven, fact-checked report that shows up every week without anyone having to remember to run it — while keeping a human in the loop for anything that leaves the account (the agent drafts, it never sends).

## Architecture

```
Meta Ads MCP + messaging-inbox API  →  raw data (JSON)  →  LLM analysis  →  branded HTML  →  Gmail draft + push notification
```

No secrets live in this repo — authentication to Meta and Gmail happens through pre-authorized MCP connectors, and the read-only messaging-inbox credential is stored only as an environment variable on the scheduled routine, never committed here. See [`README.es.md`](README.es.md) for the full technical runbook: exact data shapes, field mappings, and the local (token-based) fallback path for running the pipeline outside of the scheduled job.

## Stack

- **Node.js** — data-fetch scripts (Meta insights + messaging-inbox reconciliation); `docx` is only used for the more formal monthly report
- **Meta Marketing API** via an MCP connector — creative-level, day-by-day insights, reach and frequency
- **Chatwoot API** (or equivalent messaging-inbox API) — real conversation counts, read-only
- **Gmail API** via an MCP connector — draft creation
- **Claude Code scheduled routines** — the orchestration layer; no server, no cron box to maintain

## Status

Live and running weekly for the client's Meta Ads account. No real client financial data is committed to this repo — all figures are fetched fresh on each run and never persisted here.
