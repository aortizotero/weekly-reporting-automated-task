# weekly-reporting-automated-task

🇬🇧 [Read this in English](README.md)

Genera el reporte semanal (y sirve de base para el mensual) de Creative Performance del cliente, con el look and feel de su marca, entregado como resumen en HTML directo en el cuerpo del correo (sin adjunto).

Cuenta publicitaria: la del cliente (ID vía variable de entorno o el conector MCP, nunca hardcodeado).

## Pipeline

1. **Obtener datos** — breakdown por creativo (ad) y por día de las campañas activas.
   - **Camino primario (recomendado, sin tokens):** usar el conector MCP de Meta ya conectado en claude.ai (`ads_get_ad_entities`, `level: "ad"`, `time_increment: "1"`, `filtering: [{"field":"campaign.effective_status","operator":"IN","value":["ACTIVE"]}]`, `fields: ["id","name","campaign_id","amount_spent","impressions","clicks","unique_link_click","results","cost_per_result"]`). El campo `results`/`cost_per_result` ya resuelve automáticamente la métrica de conversión configurada en la campaña (para el cliente: "Messaging conversations started") — no hay que adivinar el `action_type`.
     - **Importante — clics:** `clicks` es "clics totales" (cualquier tap/swipe en el anuncio: ampliar foto, clic al perfil, etc.), **no** clics al botón/CTA de WhatsApp. Para saber cuánta gente le dio clic al CTA, usar `unique_link_click` (personas que dieron clic al link). Si `unique_link_click` viene null para un ad/día (pasa con conversiones de atribución retrasada, fuera de la ventana del reporte), tratarlo como 0, no como dato faltante.
   - **Camino alterno (local, con token):** `fetch_weekly_data.js`, requiere `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` como variables de entorno (sin defaults hardcodeados). Usar solo si el MCP no está disponible.
   - Cualquiera de los dos caminos debe producir/transformarse a la forma de `week_data.json` (ver "Forma de los datos" abajo).

2. **Analizar y escribir el criterio** — esto SIEMPRE lo hace el agente/modelo con juicio real sobre los números, nunca una plantilla fija. Ver "Forma de narrative.json" abajo. Comparar semana actual vs semana previa (7 días antes del rango actual). Al hablar de clics en el contexto o los hallazgos, usar siempre `cta_clicks` (clics al CTA de WhatsApp) y la tasa CTA→conversación, nunca `clicks` (clics totales) — `clicks` puede subir o bajar por razones que no tienen nada que ver con el interés real en contactar al negocio (fotos ampliadas, clics al perfil, etc.) y da lecturas engañosas sobre el desempeño.

3. **Construir el resumen en HTML** — el agente compone directamente el HTML del correo (sin generar ni adjuntar un .docx). Usa tablas con estilos inline (compatibilidad de clientes de correo), los colores de marca definidos en `build_weekly_report.js` (`BLUE_DARK #1F4E79`, `BLUE_MED #2E75B6`, `BLUE_LIGHT #D5E8F0`, `GREEN_BG #E2EFDA` / `GREEN_TEXT #375623`, `YELLOW_BG #FFF2CC` / `YELLOW_TEXT #7F6000`, `RED_BG #FCE4D6` / `RED_TEXT #C00000`, `GRAY_BG #F2F2F2`), y esta estructura: encabezado con nombre del cliente y rango de fechas, tabla de métricas (Inversión, Impresiones, Clics al CTA, Conversaciones, Tasa CTA→conversación, Costo por conversación — actual vs anterior vs variación), sección de Hallazgos, sección de Recomendaciones con badge de prioridad (ALTA=rojo, MEDIA=amarillo, BAJA=verde), y pie de página con el disclaimer de que es un borrador generado automáticamente. `build_weekly_report.js` (motor del .docx) queda disponible solo para generación manual/legacy; la rutina automática ya no lo invoca.

4. **Revisar** el HTML antes de insertarlo: etiquetas balanceadas, sin campos vacíos o `undefined`, números cuadrando contra `week_data.json`. No aplica el skill `docx` / `validate.py` porque ya no se genera un .docx en este flujo.

5. **Entregar** — guardar localmente y/o según la rutina que lo dispare (ver Automatización).

## Forma de los datos — `week_data.json`

```json
{
  "period": {
    "since": "YYYY-MM-DD", "until": "YYYY-MM-DD",
    "campaigns": ["Nombre campaña", "..."],
    "creatives": [
      {
        "ad_id": "...", "ad_name": "...", "campaign_name": "...",
        "spend": 0, "impressions": 0, "clicks": 0, "cta_clicks": 0, "convs": 0,
        "cost_per_conv": 0, "cta_conversion_rate": 0,
        "days": [{"date": "YYYY-MM-DD", "spend": 0, "impressions": 0, "clicks": 0, "cta_clicks": 0, "convs": 0}]
      }
    ],
    "totals": {"spend": 0, "impressions": 0, "clicks": 0, "cta_clicks": 0, "convs": 0, "cost_per_conv": 0, "cta_conversion_rate": 0}
  },
  "prior": { "...misma forma, semana anterior..." },
  "conversion_action_type": "..."
}
```

`clicks` se conserva solo como referencia de contexto (volumen total de interacciones); `cta_clicks` (viene de `unique_link_click`) y `cta_conversion_rate` (`convs / cta_clicks`, redondeado a 1 decimal) son los campos que hay que usar para analizar interés real en el CTA y para las tablas del resumen.

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

Reglas de contenido (heredadas de las reglas de marca del cliente, definidas en su documento interno de contexto de marca): nunca "gratis", evitar rayas largas (em dashes), tono profesional/directo/educativo. Al citar cifras de clics en `contexto` o `hallazgos`, usar siempre `cta_clicks`/`cta_conversion_rate`, nunca `clicks` (clics totales).

## Automatización

- **Reporte semanal automático** (rutina en la nube, todos los lunes 6:00 AM hora Monterrey): corre el pipeline completo sin intervención de Alex — obtiene los datos de la semana recién cerrada (lunes a domingo anterior) vía el conector MCP de Meta, escribe el análisis, arma el resumen en HTML y lo entrega directo en el cuerpo de un **draft** de Gmail, sin adjunto (nunca se envía solo). Termina con una notificación push avisando que el draft está listo para revisar.
- **Reporte mensual completo**: usar el skill dedicado de reporte mensual (comparativo mes vs mes, análisis por tipo de CTA) — solo ofrecerlo en la primera semana del mes, nunca generarlo automáticamente sin que Alex lo pida.

### Configuración del trigger

Los triggers recurrentes de Claude Code on the web se configuran en la UI del entorno (Settings → Triggers), no desde una sesión de chat ni desde código en este repo — una sesión de Claude Code no tiene forma de crear ese tipo de trigger por sí misma. El texto exacto a pegar ahí (cron, zona horaria y prompt) está en [`TRIGGER_PROMPT.md`](TRIGGER_PROMPT.md).

Nota: la herramienta `CronCreate` que a veces usan las sesiones de Claude Code **no sirve para esto** — vive solo dentro de esa sesión, muere si la sesión termina, y expira sola a los 7 días aunque la sesión siga viva. Si alguna vez el reporte semanal deja de llegar, lo primero que hay que revisar es si el trigger real (el de la UI) sigue configurado, no si hay un cron job corriendo.

## Archivos

- `build_weekly_report.js` — motor de plantilla del .docx (colores/tablas de la marca del cliente). Ya no lo invoca la rutina automática semanal (que ahora entrega HTML en el cuerpo del correo); queda como herramienta manual/legacy por si algún día se necesita un .docx de nuevo. Sigue siendo la referencia de colores de marca para el HTML.
- `fetch_weekly_data.js` — camino alterno local con token (ver arriba, no es el camino primario).
- `package.json` — depende de `docx` (npm), usada solo por `build_weekly_report.js`.
