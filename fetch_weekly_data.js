// Fetches ad-level daily insights for the MotorLab ad account, for a given
// date range and the equivalent prior range, and aggregates per creative.
// Deterministic, no judgment calls — the reporting agent adds analysis on top.
//
// Usage:
//   node --env-file=../MCPs/mcp-meta-ads/.env fetch_weekly_data.js --since 2026-07-26 --until 2026-08-01
// Output: JSON on stdout — { period: {...}, prior: {...} }

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "act_721186374214232";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
if (!ACCESS_TOKEN) throw new Error("Falta META_ACCESS_TOKEN en el entorno");

const CONVERSION_ACTION_TYPE = "onsite_conversion.messaging_conversation_started_7d";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fetchRange(since, until) {
  const fields = "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type";
  const filtering = JSON.stringify([{ field: "campaign.effective_status", operator: "IN", value: ["ACTIVE"] }]);
  const params = new URLSearchParams({
    level: "ad",
    time_increment: "1",
    fields,
    filtering,
    time_range: JSON.stringify({ since, until }),
    access_token: ACCESS_TOKEN,
    limit: "500",
  });
  const url = `https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Graph API error: ${JSON.stringify(data.error)}`);
  return data.data || [];
}

function convsOf(row) {
  const a = (row.actions || []).find((x) => x.action_type === CONVERSION_ACTION_TYPE);
  return a ? Number(a.value) : 0;
}

function aggregate(rows) {
  const byCreative = {};
  const byCampaign = new Set();
  for (const row of rows) {
    byCampaign.add(row.campaign_name);
    const key = row.ad_id;
    if (!byCreative[key]) {
      byCreative[key] = {
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        campaign_name: row.campaign_name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        convs: 0,
        days: [],
      };
    }
    const c = byCreative[key];
    const spend = Number(row.spend || 0);
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    const convs = convsOf(row);
    c.spend += spend;
    c.impressions += impressions;
    c.clicks += clicks;
    c.convs += convs;
    c.days.push({ date: row.date_start, spend, impressions, clicks, convs });
  }
  const creatives = Object.values(byCreative).map((c) => ({
    ...c,
    spend: Math.round(c.spend * 100) / 100,
    cost_per_conv: c.convs > 0 ? Math.round((c.spend / c.convs) * 100) / 100 : null,
    days: c.days.sort((a, b) => a.date.localeCompare(b.date)),
  }));
  const totals = creatives.reduce(
    (acc, c) => {
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.convs += c.convs;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, convs: 0 }
  );
  totals.spend = Math.round(totals.spend * 100) / 100;
  totals.cost_per_conv = totals.convs > 0 ? Math.round((totals.spend / totals.convs) * 100) / 100 : null;
  return { campaigns: [...byCampaign], creatives, totals };
}

async function main() {
  const { since, until } = parseArgs();
  if (!since || !until) throw new Error("Uso: --since YYYY-MM-DD --until YYYY-MM-DD");

  const priorUntil = addDays(since, -1);
  const spanDays = (new Date(until) - new Date(since)) / 86400000;
  const priorSince = addDays(priorUntil, -spanDays);

  const [currentRows, priorRows] = await Promise.all([
    fetchRange(since, until),
    fetchRange(priorSince, priorUntil),
  ]);

  const result = {
    period: { since, until, ...aggregate(currentRows) },
    prior: { since: priorSince, until: priorUntil, ...aggregate(priorRows) },
    conversion_action_type: CONVERSION_ACTION_TYPE,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
