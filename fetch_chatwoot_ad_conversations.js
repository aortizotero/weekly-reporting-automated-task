// Cuenta cuántas conversaciones de Chatwoot en un rango de fechas vinieron REALMENTE
// de un clic en anuncio (content_attributes.referral.source_type === "ad" en el primer
// mensaje entrante), para cruzar contra el numero de "resultados" que reporta Meta en
// fetch_weekly_data.js. Meta puede sobre-contar en los bordes de la ventana de reporte
// que se le pida — este script es la fuente de verdad real.
//
// Una conversacion SIN `referral` no siempre es organica. Segun como esten armados los
// inboxes del cliente, puede ser: (a) el mismo inbox de anuncios, pero a ese webhook en
// particular Meta no le mando el campo referral (hueco de datos, no un cliente que
// llego solo — el primer mensaje suele calzar con el texto de arranque del anuncio), o
// (b) un canal distinto a WhatsApp (ej. el chat de la pagina web), que nunca va a traer
// ese campo. Este script separa ambos casos en vez de llamarlos "organico" a ciegas —
// ajustar ADS_INBOX_NAME / WEBSITE_CHAT_INBOX_NAME abajo a los inboxes reales del cliente.
//
// Variables de entorno: CHATWOOT_BASE_URL (default https://ml.reptilialab.com),
// CHATWOOT_ACCOUNT_ID (default 1), CHATWOOT_API_TOKEN (token de solo lectura).
// El token es opcional: en la rutina en la nube no existe como variable, lo inyecta el
// proxy del sandbox como encabezado `api_access_token` (secreto "Chatwoot" del
// environment). Por eso las peticiones van por curl, que respeta HTTPS_PROXY (el fetch
// de Node no). Fechas en hora de Monterrey (UTC-6, sin horario de verano).
//
// Uso:
//   node --env-file=.env fetch_chatwoot_ad_conversations.js --since 2026-08-24 --until 2026-09-20
// Output: JSON en stdout — { since, until, total_conversations, ad_conversations,
//   sin_referral_inbox_ads, otro_canal, otros_inboxes, excluded,
//   by_day: { "YYYY-MM-DD": { total, ad } } }

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

const ADS_INBOX_NAME = process.env.CHATWOOT_ADS_INBOX_NAME || "Leads Publicidad Pagada";
const WEBSITE_CHAT_INBOX_NAME = process.env.CHATWOOT_WEBSITE_INBOX_NAME || "Motorlab";
const EXCLUDE_PHONES = (process.env.CHATWOOT_EXCLUDE_PHONES || "5218110397098").split(",").filter(Boolean);
const BASE_URL = process.env.CHATWOOT_BASE_URL || "https://ml.reptilialab.com";
const ACC = process.env.CHATWOOT_ACCOUNT_ID || "1";
const TOKEN = process.env.CHATWOOT_API_TOKEN || "";
const TZ_OFFSET = "-06:00"; // America/Monterrey
const CONCURRENCY = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

async function cw(urlPath) {
  const args = ["-sS", "--fail-with-body", "--max-time", "60", `${BASE_URL}/api/v1/accounts/${ACC}${urlPath}`];
  if (TOKEN) args.push("-H", `api_access_token: ${TOKEN}`);
  try {
    const { stdout } = await run("curl", args, { maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) {
    throw new Error(`Chatwoot fallo en ${urlPath}: ${(e.stderr || e.message || "").trim()} ${(e.stdout || "").slice(0, 200)}`);
  }
}

async function loadInboxNames() {
  const data = await cw(`/inboxes`);
  const names = {};
  for (const ib of data?.payload || []) names[ib.id] = ib.name;
  return names;
}

// Chatwoot ordena por last_activity_at desc. Una conversacion creada en el rango tiene
// actividad >= sinceTs, asi que cuando una pagina entera ya es mas vieja, paramos.
async function listConversations(sinceTs, untilTs) {
  const inRange = [];
  for (let page = 1; page <= 200; page++) {
    const data = await cw(`/conversations?status=all&page=${page}`);
    const payload = data?.data?.payload || data?.payload || [];
    if (payload.length === 0) break;
    for (const conv of payload) {
      if (conv.created_at >= sinceTs && conv.created_at < untilTs) inRange.push(conv);
    }
    if (payload.every((c) => (c.last_activity_at || c.timestamp || 0) < sinceTs)) break;
  }
  return inRange;
}

// ?after=0 regresa los mensajes desde el inicio de la conversacion (orden ascendente).
async function findFirstInboundMessage(conversationId) {
  const data = await cw(`/conversations/${conversationId}/messages?after=0`);
  const inbound = (data?.payload || []).filter((m) => m.message_type === 0);
  inbound.sort((a, b) => a.created_at - b.created_at);
  return inbound[0] || null;
}

function dateKey(unixTs) {
  return new Date((unixTs - 6 * 3600) * 1000).toISOString().slice(0, 10);
}

async function main() {
  const { since, until } = parseArgs();
  if (!since || !until) throw new Error("Uso: --since YYYY-MM-DD --until YYYY-MM-DD");

  const sinceTs = Math.floor(new Date(`${since}T00:00:00${TZ_OFFSET}`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T00:00:00${TZ_OFFSET}`).getTime() / 1000) + 86400; // hasta incluye el dia completo

  const all = await listConversations(sinceTs, untilTs);
  const inboxNames = await loadInboxNames();

  const conversations = all.filter((conv) => {
    const phone = conv.meta?.sender?.phone_number || conv.contact_inbox?.source_id || "";
    return !EXCLUDE_PHONES.some((p) => phone.includes(p));
  });
  const excludedCount = all.length - conversations.length;

  const firstMsgs = [];
  for (let i = 0; i < conversations.length; i += CONCURRENCY) {
    const batch = conversations.slice(i, i + CONCURRENCY);
    firstMsgs.push(...(await Promise.all(batch.map((c) => findFirstInboundMessage(c.id)))));
  }

  const byDay = {};
  let adCount = 0;
  let sinReferralInboxAds = 0;
  let otroCanal = 0;
  let otrosInboxes = 0;

  conversations.forEach((conv, i) => {
    const day = dateKey(conv.created_at);
    if (!byDay[day]) byDay[day] = { total: 0, ad: 0 };
    byDay[day].total += 1;

    if (firstMsgs[i]?.content_attributes?.referral?.source_type === "ad") {
      adCount += 1;
      byDay[day].ad += 1;
      return;
    }
    const inboxName = inboxNames[conv.inbox_id] || `inbox_${conv.inbox_id}`;
    if (WEBSITE_CHAT_INBOX_NAME && inboxName === WEBSITE_CHAT_INBOX_NAME) otroCanal += 1;
    else if (inboxName === ADS_INBOX_NAME) sinReferralInboxAds += 1;
    else otrosInboxes += 1;
  });

  const sortedByDay = Object.fromEntries(Object.entries(byDay).sort());
  const result = {
    since,
    until,
    timezone: "America/Monterrey",
    total_conversations: conversations.length,
    ad_conversations: adCount,
    // probablemente SI son de anuncio (mismo inbox de ads, texto de arranque de anuncio)
    // pero a Meta no le llego el campo referral en ese webhook puntual.
    sin_referral_inbox_ads: sinReferralInboxAds,
    // canal distinto a WhatsApp (ej. chat de la pagina web) — nunca va a traer referral.
    otro_canal: otroCanal,
    otros_inboxes: otrosInboxes,
    excluded: excludedCount,
    by_day: sortedByDay,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
