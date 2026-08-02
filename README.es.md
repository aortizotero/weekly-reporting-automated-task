# motorlab-reporting

🇬🇧 [Read this in English](README.md)

Genera el reporte semanal (y sirve de base para el mensual) de Creative Performance del cliente, con el look and feel de su marca.

Cuenta publicitaria: la del cliente (ID vía variable de entorno o el conector MCP, nunca hardcodeado).

## Pipeline

1. **Obtener datos** — breakdown por creativo (ad) y por día de las campañas activas.
   - **Camino primario (recomendado, sin tokens):** usar el conector MCP de Meta ya conectado en claude.ai (`ads_get_ad_entities`, `level: "ad"`, `time_increment: "1"`, `filtering: [{"field":"campaign.effective_status","operator":"IN","value":["ACTIVE"]}]`, `fields: ["id","name","campaign_id","amount_spent","impressions","clicks","results","cost_per_result"]`). El campo `results`/`cost_per_result` ya resuelve automáticamente la métrica de conversión configurada en la campaña (para el cliente: "Messaging conversations started") — no hay que adivinar el `action_type`.
   - **Camino alterno (local, con token):** `fetch_weekly_data.js`, requiere `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` como variables de entorno (sin defaults hardcodeados). Usar solo si el MCP no está disponible.
   - Cualquiera de los dos caminos debe producir/transformarse a la forma de `week_data.json` (ver "Forma de los datos" abajo).

2. **Analizar y escribir el criterio** — esto SIEMPRE lo hace el agente/modelo con juicio real sobre los números, nunca una plantilla fija. Ver "Forma de narrative.json" abajo. Comparar semana actual vs semana previa (7 días antes del rango actual).

3. **Construir el .docx** — `node build_weekly_report.js week_data.json narrative.json output.docx`. Requiere `npm install` primero (usa la librería `docx`).

4. **Validar** (usa el skill `docx` de Claude Code, `scripts/office/validate.py`). En Windows, forzar UTF-8 o falla con un error de encoding falso positivo:
   ```bash
   PYTHONUTF8=1 python validate.py output.docx
   ```

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
        "spend": 0, "impressions": 0, "clicks": 0, "convs": 0,
        "cost_per_conv": 0,
        "days": [{"date": "YYYY-MM-DD", "spend": 0, "impressions": 0, "clicks": 0, "convs": 0}]
      }
    ],
    "totals": {"spend": 0, "impressions": 0, "clicks": 0, "convs": 0, "cost_per_conv": 0}
  },
  "prior": { "...misma forma, semana anterior..." },
  "conversion_action_type": "..."
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

Reglas de contenido (heredadas de las reglas de marca del cliente, definidas en su documento interno de contexto de marca): nunca "gratis", evitar rayas largas (em dashes), tono profesional/directo/educativo.

## Automatización

- **Recordatorio semanal** (rutina en la nube, sábados 1pm hora Monterrey): por ahora solo manda una notificación push, Alex corre el reporte manualmente pidiéndoselo a Claude Code.
- **Reporte mensual completo**: usar el skill dedicado de reporte mensual (comparativo mes vs mes, análisis por tipo de CTA) — solo ofrecerlo en la primera semana del mes, nunca generarlo automáticamente sin que Alex lo pida.

## Archivos

- `build_weekly_report.js` — motor de plantilla del .docx (colores/tablas de la marca del cliente). No debería necesitar cambios seguido.
- `fetch_weekly_data.js` — camino alterno local con token (ver arriba, no es el camino primario).
- `package.json` — depende de `docx` (npm).
