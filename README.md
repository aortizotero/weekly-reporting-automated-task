# weekly-reporting-automated-task

🇲🇽 [Leer en español](README.es.md)

Automated weekly ad-performance reporting for **an auto-repair shop**, a preventive-maintenance auto shop in Monterrey, Mexico. Every Saturday, an autonomous Claude Code routine pulls live creative-level performance data straight from Meta Ads, writes an actual analysis of the week (not a templated summary), and delivers a branded Word report as a ready-to-send Gmail draft — with zero API tokens stored anywhere in the pipeline.

## What it does

1. **Pulls live data** — day-by-day, creative-by-creative spend, impressions, and conversions for every active campaign on the ad account, via Meta's official Ads MCP connector (no long-lived API key involved).
2. **Analyzes it** — an LLM writes the actual findings and recommendations each week: which creatives are winning, which are losing efficiency, what changed vs. the prior week. This is judgment, not a fill-in-the-blanks template.
3. **Builds the report** — a Node/`docx` engine renders a multi-page Word document matching the client's brand (cover page, KPI summary boxes, top-performer table, daily breakdown, prioritized recommendations).
4. **Delivers it safely** — the finished `.docx` is attached to a Gmail **draft**, never auto-sent. A human always reviews before it goes out.
5. **Runs on a schedule** — a cron-triggered cloud agent does all of the above unattended, then pings the account owner with a push notification once the draft is ready.

## Why this exists

Manually pulling Ads Manager exports and writing a weekly performance summary is repetitive, easy to skip, and easy to do inconsistently. This turns it into a standing, judgment-driven report that shows up every week without anyone having to remember to run it — while keeping a human in the loop for anything that leaves the account (the agent drafts, it never sends).

## Architecture

```
Meta Ads MCP  →  raw data (JSON)  →  LLM analysis (narrative.json)  →  docx template engine  →  Gmail draft + push notification
```

No secrets live in this repo or in the scheduled job's configuration — authentication to Meta and Gmail happens through pre-authorized MCP connectors, not embedded API keys. See [`README.es.md`](README.es.md) for the full technical runbook: exact data shapes, field mappings, and the local (token-based) fallback path for running the pipeline outside of the scheduled job.

## Stack

- **Node.js** + [`docx`](https://www.npmjs.com/package/docx) — brand-accurate `.docx` generation (custom KPI boxes, colored tables, headers/footers, no template dependency on Word/Office)
- **Meta Marketing API** via an MCP connector — creative-level, day-by-day insights
- **Gmail API** via an MCP connector — draft creation with attachments
- **Claude Code scheduled routines** — the orchestration layer; no server, no cron box to maintain

## Status

Live and running weekly for the client's Meta Ads account. No real client financial data is committed to this repo — all figures are fetched fresh on each run and never persisted here.
