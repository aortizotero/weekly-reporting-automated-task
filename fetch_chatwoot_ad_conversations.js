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
// Requiere variables de entorno: CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID,
// CHATWOOT_API_TOKEN (token de solo lectura).
//
// Uso:
//   node --env-file=.env fetch_chatwoot_ad_conversations.js --since 2026-08-24 --until 2026-09-20
// Output: JSON en stdout — { since, until, total_conversations, ad_conversations,
//   sin_referral_inbox_ads, otro_canal, otros_inboxes, excluded,
//   by_day: { "YYYY-MM-DD": { total, ad } } }

const ADS_INBOX_NAME = process.env.CHATWOOT_ADS_INBOX_NAME || "Leads Publicidad Pagada";
const WEBSITE_CHAT_INBOX_NAME = process.env.CHATWOOT_WEBSITE_INBOX_NAME || "";
const EXCLUDE_PHONES = (process.env.CHATWOOT_EXCLUDE_PHONES || "").split(",").filter(Boolean);
const MAX_MESSAGE_PAGES = 20; // salvaguarda contra hilos anormalmente largos

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].replace(/^--/, "")] = args[i + 1];
  return out;
}

function loadCreds() {
  const creds = {
    CHATWOOT_BASE_URL: process.env.CHATWOOT_BASE_URL,
    CHATWOOT_ACCOUNT_ID: process.env.CHATWOOT_ACCOUNT_ID,
    CHATWOOT_API_TOKEN: process.env.CHATWOOT_API_TOKEN,
  };
  if (!creds.CHATWOOT_BASE_URL || !creds.CHATWOOT_ACCOUNT_ID || !creds.CHATWOOT_API_TOKEN) {
    throw new Error("Faltan CHATWOOT_BASE_URL / CHATWOOT_ACCOUNT_ID / CHATWOOT_API_TOKEN en el entorno");
  }
  return creds;
}

async function cw(creds, urlPath) {
  const url = `${creds.CHATWOOT_BASE_URL}${urlPath}`;
  const res = await fetch(url, { headers: { api_access_token: creds.CHATWOOT_API_TOKEN } });
  if (!res.ok) throw new Error(`Chatwoot ${res.status} en ${urlPath}`);
  return res.json();
}

async function loadInboxNames(creds) {
  const data = await cw(creds, `/api/v1/accounts/${creds.CHATWOOT_ACCOUNT_ID}/inboxes`);
  const names = {};
  for (const ib of data?.payload || []) names[ib.id] = ib.name;
  return names;
}

async function listConversations(creds, sinceTs, untilTs) {
  const acc = creds.CHATWOOT_ACCOUNT_ID;
  const inRange = [];
  let page = 1;
  for (;;) {
    const data = await cw(creds, `/api/v1/accounts/${acc}/conversations?status=all&page=${page}`);
    const payload = data?.data?.payload || data?.payload || [];
    if (payload.length === 0) break;
    for (const conv of payload) {
      if (conv.created_at >= sinceTs && conv.created_at < untilTs) inRange.push(conv);
    }
    // Chatwoot ordena por actividad reciente, no por created_at, así que no cortamos
    // por edad de una página — solo paramos cuando ya no hay más páginas.
    page += 1;
    if (page > 200) throw new Error("Demasiadas páginas de conversaciones, revisar manualmente");
  }
  return inRange;
}

async function findFirstInboundMessage(creds, conversationId) {
  const acc = creds.CHATWOOT_ACCOUNT_ID;
  let before = undefined;
  const all = [];
  for (let i = 0; i < MAX_MESSAGE_PAGES; i++) {
    const qs = before ? `?before=${before}` : "";
    const data = await cw(creds, `/api/v1/accounts/${acc}/conversations/${conversationId}/messages${qs}`);
    const payload = data?.payload || [];
    if (payload.length === 0) break;
    all.push(...payload);
    before = payload[0].id; // la API regresa mas viejo -> mas nuevo dentro de la pagina; antes = el mas viejo de esta pagina
  }
  const inbound = all.filter((m) => m.message_type === 0);
  if (inbound.length === 0) return null;
  inbound.sort((a, b) => a.created_at - b.created_at);
  return inbound[0];
}

function dateKey(unixTs) {
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

async function main() {
  const { since, until } = parseArgs();
  if (!since || !until) throw new Error("Uso: --since YYYY-MM-DD --until YYYY-MM-DD");
  const creds = loadCreds();

  const sinceTs = Math.floor(new Date(since + "T00:00:00Z").getTime() / 1000);
  const untilTs = Math.floor(new Date(until + "T00:00:00Z").getTime() / 1000) + 86400; // hasta incluye el dia completo

  const conversations = await listConversations(creds, sinceTs, untilTs);
  const inboxNames = await loadInboxNames(creds);

  const byDay = {};
  let adCount = 0;
  let sinReferralInboxAds = 0;
  let otroCanal = 0;
  let otrosInboxes = 0;
  let excludedCount = 0;

  for (const conv of conversations) {
    const day = dateKey(conv.created_at);
    if (!byDay[day]) byDay[day] = { total: 0, ad: 0 };

    const phone = conv.meta?.sender?.phone_number || conv.contact_inbox?.source_id || "";
    if (EXCLUDE_PHONES.some((p) => p && phone.includes(p))) {
      excludedCount += 1;
      continue;
    }
    byDay[day].total += 1;

    const firstMsg = await findFirstInboundMessage(creds, conv.id);
    const referral = firstMsg?.content_attributes?.referral;
    if (referral?.source_type === "ad") {
      adCount += 1;
      byDay[day].ad += 1;
      continue;
    }

    const inboxName = inboxNames[conv.inbox_id] || `inbox_${conv.inbox_id}`;
    if (WEBSITE_CHAT_INBOX_NAME && inboxName === WEBSITE_CHAT_INBOX_NAME) otroCanal += 1;
    else if (inboxName === ADS_INBOX_NAME) sinReferralInboxAds += 1;
    else otrosInboxes += 1;
  }

  const total = conversations.length - excludedCount;
  const result = {
    since,
    until,
    total_conversations: total,
    ad_conversations: adCount,
    // probablemente SI son de anuncio (mismo inbox de ads, texto de arranque de anuncio)
    // pero a Meta no le llego el campo referral en ese webhook puntual.
    sin_referral_inbox_ads: sinReferralInboxAds,
    // canal distinto a WhatsApp (ej. chat de la pagina web) — nunca va a traer referral.
    otro_canal: otroCanal,
    otros_inboxes: otrosInboxes,
    excluded: excludedCount,
    by_day: byDay,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
