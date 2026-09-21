# weekly-reporting-automated-task

🇬🇧 [Read this in English](README.md)

Genera el reporte semanal (y sirve de base para el mensual) de Creative Performance del cliente, con el look and feel de su marca.

Cuenta publicitaria: la del cliente (ID vía variable de entorno o el conector MCP, nunca hardcodeado).

## Pipeline

0. **Antes de escribir una sola palabra del reporte, aplicar estas correcciones de métrica** (surgieron de imprecisiones reales que se colaron en un draft):
   - El presupuesto NUNCA vive a nivel anuncio (`ad`) — vive en campaña (CBO) o ad set (ABO). Nunca describir el gasto como "% del presupuesto del anuncio"; si se necesita describir cómo se repartió el gasto entre variantes, decir "% del gasto observado".
   - El campo `results` trae un `indicator` que hay que leer siempre, nunca asumir qué mide (puede ser mensajería, `reach` en campañas de reconocimiento, o `lead`).
   - "Conversación iniciada"/"Messaging conversation started" significa que la persona SÍ envió un mensaje, no que solo se le abrió WhatsApp. Nunca describirlo como "abrió WhatsApp".
   - Meta puede sobre-contar resultados en los bordes de la ventana de fechas que se le pida (atribución por clic dentro de la ventana de 7 días) — tratar la primera y la última semana de cualquier rango como provisionales hasta cruzarlas contra el paso de Chatwoot abajo.

1. **Obtener datos** — breakdown por creativo (ad) y por día de las campañas activas.
   - **Camino primario (recomendado, sin tokens):** usar el conector MCP de Meta ya conectado en claude.ai (`ads_get_ad_entities`, `level: "ad"`, `time_increment: "1"`, `filtering: [{"field":"ad.amount_spent","operator":"GREATER_THAN","value":["0"]}]`, `fields: ["id","name","campaign_id","amount_spent","impressions","clicks","results","cost_per_result","reach","frequency"]`). El campo `results`/`cost_per_result` ya resuelve automáticamente la métrica de conversión configurada en la campaña. Nota: `sort` no funciona bien combinado con `time_increment` (regresa ceros primero) — usar el filtro de `amount_spent` en vez de confiar en `sort`.
   - **Camino alterno (local, con token):** `fetch_weekly_data.js`, requiere `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` como variables de entorno (sin defaults hardcodeados). Ya incluye desglose por día de la semana (`by_weekday` en `period`) para el paso 2. Usar solo si el MCP no está disponible.
   - Cualquiera de los dos caminos debe producir/transformarse a la forma de `week_data.json` (ver "Forma de los datos" abajo).
   - **Obtener también el número real de conversaciones desde el sistema de mensajería del cliente (ej. Chatwoot):** `fetch_chatwoot_ad_conversations.js` (requiere `CHATWOOT_BASE_URL`/`CHATWOOT_ACCOUNT_ID`/`CHATWOOT_API_TOKEN` como variables de entorno; opcionalmente `CHATWOOT_ADS_INBOX_NAME`, `CHATWOOT_WEBSITE_INBOX_NAME`, `CHATWOOT_EXCLUDE_PHONES` si el default no aplica). Cuenta conversaciones reales por `content_attributes.referral.source_type === "ad"` del primer mensaje entrante. Este paso es obligatorio si esas credenciales están configuradas — es la única forma de saber si el número de Meta de esa semana es confiable. Si no hay credenciales, seguir sin este paso pero marcar el número de Meta como "sin verificar contra la fuente real" en el reporte.
   - **Alcance vs. frecuencia (saturación de audiencia):** con `reach`/`frequency` por semana de las últimas 3-4 semanas, revisar si el alcance nuevo por peso gastado está bajando y la frecuencia subiendo — es la señal de que la segmentación actual ya se está saturando y toca expandir audiencia antes de seguir subiendo presupuesto ahí.

2. **Analizar y escribir el criterio** — esto SIEMPRE lo hace el agente/modelo con juicio real sobre los números, nunca una plantilla fija. Comparar semana actual vs semana previa (7 días antes del rango actual). El análisis SIEMPRE debe cubrir estos cinco ángulos, no solo gasto/conversiones:
   - **Reconciliación con la fuente real:** comparar `totals.convs` (Meta) contra `ad_conversations` (paso 1). Si difieren más de ~10%, decirlo explícitamente y no tratar el número de Meta como definitivo — especialmente si la semana reportada es la primera o la última de un rango más largo.
   - **Por creativo:** cuál creativo trae más volumen, cuál mejoró/empeoró vs la semana previa, y si el copy lo escribió el cliente o lo generó la IA de Meta (Advantage+ text variations — un creativo con `body` vacío y `object_type: "SHARE"` es la señal).
   - **Por formato/copy:** agrupar por tipo (imagen estática, video con guion, carrusel) y por ángulo de copy, no solo por nombre de anuncio individual.
   - **Por día de la semana:** usar `period.by_weekday` (o el desglose diario agregado manualmente por día de semana) para decir qué días rinden mejor/peor.
   - **Saturación de audiencia:** si el alcance nuevo por peso gastado viene cayendo y la frecuencia subiendo semana a semana, decirlo como hallazgo — es el momento de proponer expandir audiencia antes de subir presupuesto en la misma segmentación.

3. **Escribir el resumen para quien decide** — en la voz de quien opera la cuenta (primera persona, tono directo/casual, cero lenguaje de framework o relleno de IA), no como reporte corporativo. Cada afirmación numérica lleva su tabla de respaldo justo debajo, no una sola tabla gigante al final. Cierra con las decisiones concretas a proponer (o una pregunta si falta información para decidir), no con un resumen que repite lo ya dicho.

4. **Construir el HTML** con los colores/tipografía de marca del cliente (ver constantes de color en `build_weekly_report.js`), y crear un draft de Gmail dirigido a quien opera la cuenta — nunca enviarlo directo a quien toma la decisión final, y nunca enviarlo automáticamente. Revisar que el HTML tenga etiquetas balanceadas y los números cuadrando contra los datos crudos antes de insertarlo.

5. **Entregar** — el draft de Gmail queda para revisión humana antes de reenviarlo o convertirlo en el mensaje que se manda por el canal real (ver Automatización). El motor de `.docx` (`build_weekly_report.js`) sigue disponible para el reporte mensual más formal, pero ya no es la salida por default del semanal.

## Forma de los datos — `week_data.json`

```json
{
  "period": {
    "since": "YYYY-MM-DD", "until": "YYYY-MM-DD",
    "campaigns": ["Nombre campaña", "..."],
    "creatives": [
      {
        "ad_id": "...", "ad_name": "...", "campaign_name": "...",
        "spend": 0, "impressions": 0, "clicks": 0, "convs": 0,
        "cost_per_conv": 0,
        "days": [{"date": "YYYY-MM-DD", "spend": 0, "impressions": 0, "clicks": 0, "convs": 0}]
      }
    ],
    "totals": {"spend": 0, "impressions": 0, "clicks": 0, "convs": 0, "cost_per_conv": 0},
    "by_weekday": {"Lunes": {"spend": 0, "convs": 0, "cost_per_conv": 0}, "...": "..."}
  },
  "prior": { "...misma forma, semana anterior..." },
  "conversion_action_type": "...",
  "chatwoot_reconciliation": {"total_conversations": 0, "ad_conversations": 0, "sin_referral_inbox_ads": 0, "otro_canal": 0}
}
```

Si los datos vienen del MCP (`ads_get_ad_entities`), hay que parsear `amount_spent` (viene como string `"$205,30 MXN"`) y `results.value` (viene como string `"5 (Messaging conversations started)"`) a números antes de armar este JSON.

## Forma de `narrative.json`

```json
{
  "contexto": ["1-2 párrafos de contexto general de la semana"],
  "hallazgos": ["5-6 hallazgos específicos, patrón: 'Creatividad: observación específica. Por qué importa.'"],
  "recomendaciones": [{"priority": "ALTA|MEDIA|BAJA", "action": "...", "justification": "..."}],
  "monthlyOffer": "Texto opcional, solo si hoy cae en los primeros 7 días del mes — ofrece (no genera) el reporte mensual completo."
}
```

Reglas de contenido (heredadas de las reglas de marca del cliente, definidas en su documento interno de contexto de marca): nunca "gratis", evitar rayas largas (em dashes), tono profesional/directo/educativo. Nunca describir el gasto como "% del presupuesto del anuncio" (el presupuesto vive en campaña/ad set, no en el ad) — si se necesita describir cómo se repartió el gasto entre variantes, decir "% del gasto observado". Nunca describir "conversación iniciada" como "abrió WhatsApp" — la métrica exige que la persona haya enviado un mensaje.

## Automatización

- **Reporte semanal** (rutina en la nube, corre sola cada semana): ejecuta el pipeline completo (pasos 1-4) y deja el draft de Gmail listo para revisión — nunca lo envía sola. Manda una notificación push cuando el draft queda listo, o describiendo el error específico si algo falla (conector desconectado, datos vacíos, etc.) en vez de dejar un reporte a medias.
- **Reporte mensual completo**: usar el skill dedicado de reporte mensual (comparativo mes vs mes, análisis por tipo de CTA) — solo ofrecerlo en la primera semana del mes, nunca generarlo automáticamente sin que se pida.

## Archivos

- `build_weekly_report.js` — motor de plantilla del .docx (colores/tablas de la marca del cliente), usado por el reporte mensual. Ya no es la salida por default del semanal (ver paso 4 del pipeline).
- `fetch_weekly_data.js` — camino alterno local con token (ver arriba, no es el camino primario). Incluye desglose por día de la semana.
- `fetch_chatwoot_ad_conversations.js` — cuenta conversaciones reales por `referral` de anuncio en el sistema de mensajería del cliente, para el paso 1 (obligatorio si hay credenciales) de reconciliación contra el número de Meta.
- `package.json` — depende de `docx` (npm), solo necesario para el camino del `.docx` mensual.
