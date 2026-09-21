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
Genera el reporte semanal de rendimiento de anuncios de MotorLab para la
semana que acaba de cerrar (lunes a domingo), siguiendo el pipeline
documentado en README.es.md de este repo (léelo primero, especialmente
el paso 0 de correcciones de métrica).

1. Calcula el rango: el lunes de hace 7 días hasta el domingo de ayer
   (la semana lunes-domingo inmediatamente anterior a hoy). Usa esa
   misma duración para la semana previa de comparación, y jala también
   reach/frequency de las 3-4 semanas anteriores para el chequeo de
   saturación de audiencia.

2. Obtén los datos vía el conector MCP de Meta Ads (ads_get_ad_entities):
   - Nivel "ad", time_increment "1", filtrando por
     {"field":"ad.amount_spent","operator":"GREATER_THAN","value":["0"]}
     (nunca por effective_status), campos: id, name, campaign_id,
     campaign_name, amount_spent, impressions, clicks, results,
     cost_per_result. Revisa siempre `results.indicator` — no asumas que
     todas las campañas miden lo mismo (mensajería vs reach vs lead).
   - Nivel "campaign" para reach/frequency semanal de las últimas 3-4
     semanas de la campaña de mensajería principal.

3. Corre `fetch_chatwoot_ad_conversations.js` (usa las variables de
   entorno CHATWOOT_BASE_URL/CHATWOOT_ACCOUNT_ID/CHATWOOT_API_TOKEN, ya
   configuradas en esta rutina) para el mismo rango. Compara su
   `ad_conversations` contra el total de `results` de Meta — si difieren
   más de ~10%, dilo explícito y usa el número de Chatwoot como el real,
   sobre todo si la semana reportada es borde de un rango más largo.

4. Escribe el análisis real con juicio, en español, primera persona,
   como si Alex se lo mandara a Mario (el dueño) — nunca en tercera
   persona sobre Alex. Cubre estos 5 ángulos:
   - Reconciliación Meta vs Chatwoot (paso 3).
   - Por creativo: quién sube/baja vs la semana previa, y si el copy es
     propio de MotorLab o lo generó la IA de Meta (Advantage+ — un
     creativo con `body` vacío y `object_type: "SHARE"` es la señal).
   - Por formato/copy (imagen estática, video con guion, carrusel).
   - Por día de la semana (cuál sale más barato/caro).
   - Saturación de audiencia: si el alcance nuevo por peso gastado baja
     y la frecuencia sube semana a semana (paso 1), es momento de
     proponer expandir audiencia antes de subir presupuesto ahí.

5. Construye el resumen directo en HTML (sin generar ni adjuntar un
   .docx): cada afirmación numérica con su tabla de respaldo justo
   debajo (no una tabla gigante al final), tono directo/casual, sin
   lenguaje de framework ni relleno de IA, sin em dashes, nunca
   "gratis". Nunca describir el gasto como "% del presupuesto del
   anuncio" (el presupuesto vive en campaña/ad set, no en el ad). Nunca
   describir "conversación iniciada" como "abrió WhatsApp" (la métrica
   exige que se haya enviado un mensaje). Usa los colores de marca
   definidos en build_weekly_report.js. Cierra con 2-4 decisiones
   concretas a proponer, cada una separada (o una pregunta si falta
   información para decidir) — no un resumen que repite lo ya dicho.
   Revisa que el HTML tenga etiquetas balanceadas y los números
   cuadrando contra los datos crudos antes de insertarlo.

6. Crea un draft de Gmail (nunca lo envíes) dirigido a
   alejandroortizotero@gmail.com con el resumen como htmlBody, sin
   adjuntos. Asunto: "Meta Ads | Resumen semanal <since> – <until> <año>".

7. Manda una notificación push avisando que el draft quedó listo para
   revisar y enviar.

Si algo falla (conector desconectado, datos vacíos, error armando el
HTML), no crees un draft a medias — manda una notificación push
describiendo el error específico en vez de un reporte incompleto.
```
