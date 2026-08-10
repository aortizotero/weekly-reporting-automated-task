# Prompt del trigger — Reporte semanal automático

Este texto es el que va en el campo "prompt" del Trigger recurrente que se
configura en la UI de Claude Code on the web (Settings del entorno →
Triggers). No se puede crear ese trigger desde una sesión de chat — hay que
pegarlo ahí manualmente una vez.

- **Cron:** `0 6 * * 1` (lunes 6:00 AM)
- **Zona horaria:** America/Monterrey
- **Repo:** `aortizotero/weekly-reporting-automated-task`

## Prompt

```
Genera el reporte semanal de Creative Performance de MotorLab para la
semana que acaba de cerrar (lunes a domingo), siguiendo el pipeline
documentado en README.es.md de este repo.

1. Calcula el rango: el lunes de hace 7 días hasta el domingo de ayer
   (la semana lunes-domingo inmediatamente anterior a hoy). Usa esa
   misma duración (7 días) para la semana previa de comparación.
2. Obtén los datos vía el conector MCP de Meta Ads (ads_get_ad_entities,
   level "ad", time_increment "1", filtering por
   campaign.effective_status IN ["ACTIVE"], incluyendo el campo
   unique_link_click) para esa semana y la semana previa. Arma
   week_data.json según la forma documentada en README.es.md (parsea
   amount_spent y results.value, que vienen como strings, a números).
   clicks es clics totales (cualquier interacción con el anuncio), no
   clics al CTA de WhatsApp — usa unique_link_click como cta_clicks
   (personas que dieron clic al botón) y calcula cta_conversion_rate
   (convs / cta_clicks). Trata unique_link_click null como 0.
3. Escribe el análisis real con juicio (narrative.json): contexto,
   5-6 hallazgos, recomendaciones con prioridad ALTA/MEDIA/BAJA. Cuando
   hables de clics, usa siempre cta_clicks/cta_conversion_rate, nunca
   clicks (clics totales) — da lecturas engañosas sobre interés real en
   el CTA. Si hoy cae en los primeros 7 días del mes, agrega
   monthlyOffer ofreciendo (sin generar) el reporte mensual completo.
4. Construye el resumen directo en HTML (sin generar ni adjuntar un
   .docx): tabla de métricas (Inversión, Impresiones, Clics al CTA,
   Conversaciones, Tasa CTA→conversación, Costo por conversación —
   actual vs anterior vs variación), Hallazgos, Recomendaciones con
   badge de prioridad (ALTA rojo, MEDIA amarillo, BAJA verde), usando
   los colores de marca definidos en build_weekly_report.js. Revisa que
   el HTML tenga etiquetas balanceadas y los números cuadrando contra
   week_data.json antes de insertarlo.
5. Crea un draft de Gmail (nunca lo envíes) dirigido a
   alejandroortizotero@gmail.com con el resumen como htmlBody, sin
   adjuntos. Asunto: "Meta Ads | Resumen semanal <since> – <until> <año>".
6. Manda una notificación push avisando que el draft quedó listo para
   revisar y enviar.

Si algo falla (conector desconectado, datos vacíos, error armando el
HTML), no crees un draft a medias — manda una notificación push
describiendo el error específico en vez de un reporte incompleto.
```
