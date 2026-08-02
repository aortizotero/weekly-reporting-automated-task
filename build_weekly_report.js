// Builds the weekly creative performance .docx report for the client's ad account.
// Reads data from week_data.json (produced by fetch_weekly_data.js) and
// narrative content (hallazgos, recomendaciones) from narrative.json —
// the judgment/analysis step, written by the reporting agent each run.
//
// Usage: node build_weekly_report.js <week_data.json> <narrative.json> <output.docx>

const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageBreak, Header, Footer, PageNumber, VerticalAlign,
} = require("docx");

const [, , dataPath, narrativePath, outPath] = process.argv;
if (!dataPath || !narrativePath || !outPath) {
  console.error("Uso: node build_weekly_report.js week_data.json narrative.json output.docx");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const narrative = JSON.parse(fs.readFileSync(narrativePath, "utf8"));

// ---- Brand style constants (matching the client's monthly-report skill) ----
const BLUE_DARK = "1F4E79";
const BLUE_MED = "2E75B6";
const BLUE_LIGHT = "D5E8F0";
const GREEN_BG = "E2EFDA";
const YELLOW_BG = "FFF2CC";
const RED_BG = "FCE4D6";
const GRAY_BG = "F2F2F2";
const WHITE = "FFFFFF";
const GREEN_TEXT = "375623";
const RED_TEXT = "C00000";
const YELLOW_TEXT = "7F6000";
const BRAND_GREEN = "00AF66";
const CONTENT_W = 9360;

const C7 = [3400, 900, 1000, 850, 850, 850, 1510];
const CD = [1560, 1560, 1560, 1560, 1560, 1560];
const CR = [800, 3600, 4960];
const CT = [400, 2600, 1200, 1200, 1200, 1200, 1560];

const money = (n) => (n == null ? "--" : `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
const int_ = (n) => (n == null ? "--" : n.toLocaleString("es-MX"));
const pct = (curr, prior) => {
  if (!prior) return null;
  return Math.round(((curr - prior) / prior) * 1000) / 10;
};
const pctText = (curr, prior) => {
  const p = pct(curr, prior);
  if (p == null) return "";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p}% vs sem. anterior`;
};

function cell(text, { bold, color, shade, align, size, italics } = {}, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: align || AlignmentType.LEFT,
        children: [new TextRun({ text: String(text), bold: !!bold, color, size: size || 18, italics: !!italics })],
      }),
    ],
  });
}

function headerRow(labels, widths) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l, i) =>
      cell(l, { bold: true, color: WHITE, shade: BLUE_DARK, align: AlignmentType.CENTER, size: 18 }, widths[i])
    ),
  });
}

function rule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE_MED } },
    spacing: { after: 200 },
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 200 }, children: [new TextRun({ text, color: BLUE_DARK })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, color: BLUE_MED })] });
}
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, ...opts })] });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ---- KPI boxes ----
function kpiRow(kpis) {
  const w = Math.floor(CONTENT_W / kpis.length);
  const widths = kpis.map((_, i) => (i === kpis.length - 1 ? CONTENT_W - w * (kpis.length - 1) : w));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: kpis.map((k, i) =>
          new TableCell({
            width: { size: widths[i], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: BLUE_LIGHT },
            margins: { top: 160, bottom: 160, left: 80, right: 80 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.value, bold: true, size: 40, color: BLUE_DARK })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.label, size: 16 })] }),
              ...(k.delta
                ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.delta, size: 16, bold: true, color: k.deltaGood ? GREEN_TEXT : RED_TEXT })] })]
                : []),
            ],
          })
        ),
      }),
    ],
  });
}

// ---- CTA categorization (heuristic) ----
function classifyCTA(name) {
  const n = name.toLowerCase();
  if (n.includes("fachada") || n.includes("instalacion")) return "Imagen de marca";
  if (n.includes("top servicios") || n.includes("showcase")) return "Showcase de servicios";
  if (n.includes("promo") || n.includes("descuento") || /\$\d/.test(n)) return "Promoción específica";
  if (n.includes("diagnostico") || n.includes("urgen")) return "Diagnóstico / Urgencia";
  if (n.includes("no es un taller") || n.includes("no somos")) return "Diferenciación de marca";
  if (n.includes("chava") || n.includes("elevenlabs") || n.includes("video")) return "Educativo / Voz";
  if (n.includes("taller hoy") || n.includes("apodaca") || n.includes("colonia")) return "Pregunta geográfica";
  return "Educativo / Prevención";
}

function statusOf(creative) {
  const lastDates = creative.days.map((d) => d.date).sort();
  const lastDate = lastDates[lastDates.length - 1];
  const daysSinceLast = (new Date(data.period.until) - new Date(lastDate)) / 86400000;
  return daysSinceLast > 1 ? "Pausado" : "Activo";
}

// ---- Full creative table ----
function creativeTable(creatives) {
  const sorted = [...creatives].sort((a, b) => b.convs - a.convs);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: C7,
    rows: [
      headerRow(["Creatividad", "Spend", "Impr.", "Convs", "Cost/Conv", "Estado", "CTA"], C7),
      ...sorted.map((c, i) => {
        const status = statusOf(c);
        const shade = i % 2 === 0 ? WHITE : GRAY_BG;
        return new TableRow({
          children: [
            cell(c.ad_name, { shade }, C7[0]),
            cell(money(c.spend), { shade, align: AlignmentType.RIGHT }, C7[1]),
            cell(int_(c.impressions), { shade, align: AlignmentType.RIGHT }, C7[2]),
            cell(int_(c.convs), { shade, align: AlignmentType.CENTER, bold: true }, C7[3]),
            cell(money(c.cost_per_conv), { shade, align: AlignmentType.RIGHT }, C7[4]),
            cell(status, { shade, align: AlignmentType.CENTER, bold: true, color: status === "Activo" ? GREEN_TEXT : RED_TEXT }, C7[5]),
            cell(classifyCTA(c.ad_name), { shade, size: 16, italics: true }, C7[6]),
          ],
        });
      }),
    ],
  });
}

// ---- Top performers table ----
function topTable(creatives, topN = 3) {
  const sorted = [...creatives].filter((c) => c.convs > 0).sort((a, b) => b.convs - a.convs).slice(0, topN);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: CT,
    rows: [
      headerRow(["#", "Creatividad", "Spend", "Convs", "Cost/Conv", "Impresiones", "CTA Tipo"], CT),
      ...sorted.map((c, i) =>
        new TableRow({
          children: [
            cell(i + 1, { shade: GREEN_BG, align: AlignmentType.CENTER, bold: true }, CT[0]),
            cell(c.ad_name, { shade: GREEN_BG, bold: i === 0 }, CT[1]),
            cell(money(c.spend), { shade: GREEN_BG, align: AlignmentType.RIGHT }, CT[2]),
            cell(int_(c.convs), { shade: GREEN_BG, align: AlignmentType.CENTER, bold: true }, CT[3]),
            cell(money(c.cost_per_conv), { shade: GREEN_BG, align: AlignmentType.RIGHT }, CT[4]),
            cell(int_(c.impressions), { shade: GREEN_BG, align: AlignmentType.RIGHT }, CT[5]),
            cell(classifyCTA(c.ad_name), { shade: GREEN_BG, size: 16, italics: true }, CT[6]),
          ],
        })
      ),
    ],
  });
}

// ---- Daily breakdown table for one creative ----
function dailyTable(creative) {
  let cum = 0;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: CD,
    rows: [
      headerRow(["Fecha", "Spend", "Impr.", "Convs", "Cost/Conv", "Acum. Convs"], CD),
      ...creative.days.map((d, i) => {
        cum += d.convs;
        const shade = i % 2 === 0 ? WHITE : BLUE_LIGHT;
        const costConv = d.convs > 0 ? d.spend / d.convs : null;
        return new TableRow({
          children: [
            cell(d.date.slice(5), { shade, align: AlignmentType.CENTER }, CD[0]),
            cell(money(Math.round(d.spend * 100) / 100), { shade, align: AlignmentType.RIGHT }, CD[1]),
            cell(int_(d.impressions), { shade, align: AlignmentType.RIGHT }, CD[2]),
            cell(int_(d.convs), { shade, align: AlignmentType.CENTER, bold: true }, CD[3]),
            cell(money(costConv ? Math.round(costConv * 100) / 100 : null), { shade, align: AlignmentType.RIGHT }, CD[4]),
            cell(int_(cum), { shade, align: AlignmentType.CENTER }, CD[5]),
          ],
        });
      }),
    ],
  });
}

// ---- Recommendations table ----
function recommendationsTable(recs) {
  const colorFor = (priority) =>
    priority === "ALTA" ? { shade: RED_BG, color: RED_TEXT } : priority === "MEDIA" ? { shade: YELLOW_BG, color: YELLOW_TEXT } : { shade: GREEN_BG, color: GREEN_TEXT };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: CR,
    rows: [
      headerRow(["Prioridad", "Acción", "Justificación"], CR),
      ...recs.map((r) => {
        const c = colorFor(r.priority);
        return new TableRow({
          children: [
            cell(r.priority, { shade: c.shade, color: c.color, bold: true, align: AlignmentType.CENTER }, CR[0]),
            cell(r.action, { shade: c.shade }, CR[1]),
            cell(r.justification, { shade: c.shade, size: 16 }, CR[2]),
          ],
        });
      }),
    ],
  });
}

// ---- Assemble document ----
const periodLabel = `${data.period.since} a ${data.period.until}`;
const priorLabel = `${data.prior.since} a ${data.prior.until}`;
const t = data.period.totals;
const pt = data.prior.totals;

const kpisThis = [
  { value: money(t.spend), label: "Inversión esta semana", delta: pctText(t.spend, pt.spend), deltaGood: pct(t.spend, pt.spend) <= 0 },
  { value: int_(t.convs), label: "Conversiones", delta: pctText(t.convs, pt.convs), deltaGood: pct(t.convs, pt.convs) >= 0 },
  { value: money(t.cost_per_conv), label: "Costo / Conversión", delta: pctText(t.cost_per_conv, pt.cost_per_conv), deltaGood: pct(t.cost_per_conv, pt.cost_per_conv) <= 0 },
  { value: String(data.period.creatives.length), label: "Creatividades en pool" },
];
const kpisPrior = [
  { value: money(pt.spend), label: "Inversión sem. anterior" },
  { value: int_(pt.convs), label: "Conversiones sem. anterior" },
  { value: money(pt.cost_per_conv), label: "Costo / Conversión" },
  { value: String(data.prior.creatives.length), label: "Creatividades activas" },
];

const activeMulti = data.period.creatives
  .filter((c) => c.days.length >= 3)
  .sort((a, b) => b.convs - a.convs)
  .slice(0, 3);

const children = [
  // Cover
  new Paragraph({ children: [new TextRun({ text: "MOTORLAB", bold: true, size: 80, color: BRAND_GREEN })], spacing: { before: 2000, after: 200 }, alignment: AlignmentType.CENTER }),
  new Paragraph({ children: [new TextRun({ text: "Reporte Semanal de Creatividades", bold: true, size: 44, color: BRAND_GREEN })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
  new Paragraph({ children: [new TextRun({ text: `Semana del ${periodLabel}`, size: 32 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
  rule(),
  new Paragraph({ children: [new TextRun({ text: `Campañas activas: ${data.period.campaigns.join(", ")}`, size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
  new Paragraph({ children: [new TextRun({ text: `Comparado contra semana previa: ${priorLabel}`, size: 18, italics: true, color: "666666" })], alignment: AlignmentType.CENTER }),
  pageBreak(),

  h1("Resumen Ejecutivo"),
  h2(`Semana ${periodLabel} — Métricas Totales`),
  kpiRow(kpisThis),
  new Paragraph({ spacing: { before: 200, after: 200 } }),
  h2("Semana Previa — Referencia Comparativa"),
  kpiRow(kpisPrior),
  new Paragraph({ spacing: { before: 240 } }),
  ...narrative.contexto.map((txt) => p(txt)),
  rule(),
  h2("Top Creatividades — Esta Semana"),
  topTable(data.period.creatives),
  new Paragraph({ spacing: { before: 240 } }),
  h2("Hallazgos Clave"),
  ...narrative.hallazgos.map((h, i) => p(`${i + 1}. ${h}`, { size: 20 })),
  pageBreak(),

  h1(`Performance Completa — Semana ${periodLabel}`),
  p(`Campañas: ${data.period.campaigns.join(", ")} | Inversión en MXN | Conversión = inicio de conversación en WhatsApp`, { italics: true, size: 18, color: "666666" }),
  creativeTable(data.period.creatives),
  pageBreak(),

  h1("Desglose Diario — Creatividades Principales"),
  ...activeMulti.flatMap((c) => [
    h2(`${c.ad_name} (${c.days.length} días con actividad)`),
    p(`CTA: ${classifyCTA(c.ad_name)} | Spend total: ${money(c.spend)} | Conversiones: ${c.convs}`, { italics: true, size: 18, color: "666666" }),
    dailyTable(c),
    new Paragraph({ spacing: { after: 240 } }),
  ]),
  pageBreak(),

  h1("Recomendaciones"),
  recommendationsTable(narrative.recomendaciones),
  new Paragraph({ spacing: { before: 300 } }),
  ...(narrative.monthlyOffer ? [rule(), p(narrative.monthlyOffer, { italics: true, bold: true, color: BLUE_DARK })] : []),
];

const doc = new Document({
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1080, right: 1080 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE_MED } },
              children: [new TextRun({ text: `MotorLab  |  Reporte Semanal  |  ${periodLabel}`, size: 16, color: "666666" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: BLUE_MED } },
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Página ", size: 16, color: "666666" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" }),
                new TextRun({ text: " / ", size: 16, color: "666666" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "666666" }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`Escrito: ${outPath}`);
});
