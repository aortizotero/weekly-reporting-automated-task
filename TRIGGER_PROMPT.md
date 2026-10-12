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

3. Corre `node fetch_chatwoot_ad_conversations.js --since <lunes>
   --until <domingo>` para el mismo rango (tarda ~2 min, déjalo
   terminar en primer plano). El token de Chatwoot no es variable de
   entorno: lo inyecta el proxy del sandbox (secreto "Chatwoot" del
   Environment), así que no busques CHATWOOT_* con `env`. Compara su
   `ad_conversations` contra el total de `results` de Meta; si difieren
   más de ~10%, dilo explícito y usa el número de Chatwoot como el real,
   sobre todo si la semana reportada es borde de un rango más largo.
   Si el script falla (401, timeout, red), no inventes el número: sigue
   el reporte, marca el de Meta como "sin verificar contra Chatwoot esta
   semana" y pon el error exacto en la notificación push.

4. Analiza con juicio los 5 ángulos (reconciliación Meta vs Chatwoot,
   por creativo y si el copy es propio o de Advantage+ (`body` vacío =
   Meta), por formato/copy, por día de la semana, saturación de
   audiencia), pero en el reporte solo entra lo que explica el cambio de
   la semana o lleva a una prueba. Si en Gmail hay un reporte anterior
   ("Anuncios MotorLab | Semana") con pruebas propuestas, revisa en los
   datos cómo les fue y abre "Qué pasó" con ese resultado.

5. Escribe el reporte para Mario (el dueño) en la voz de Alex, primera
   persona, tono WhatsApp casual, directo, que quepa en una pantalla.
   Formato fijo:
   - Una línea de saludo ("Mario, va el resumen de la semana.").
   - Tabla de 3 filas: Inversión, Conversaciones por WhatsApp, Costo por
     conversación; columnas esta semana / semana pasada / cambio. Debajo
     una sola línea con el cruce de Chatwoot (o "sin verificar").
   - "Qué pasó": máximo 4 bullets. Cada uno abre con la conclusión en
     negrita y lleva un solo número de respaldo. Nada de jerga: no CPL,
     CTR, CPM, frecuencia, Advantage+, CBO; dilo en palabras ("cada
     conversación salió en $31", "el texto lo arma Meta en automático").
   - "Qué vamos a probar esta semana": 2 o 3 pruebas concretas, una
     variable cada una, cómo se decide quién gana y cuándo se reporta.
     Solo pruebas que se puedan montar en Ads Manager esta semana.
   - Opcional, una línea final con algo que se está vigilando.
   Sin tablas extra, sin resumen al final, sin em dashes, nunca
   "gratis", precios redondeados a pesos. Nunca "% del presupuesto del
   anuncio" ni "abrió WhatsApp". HTML simple con BLUE_DARK 1F4E79 y
   BRAND_GREEN 00AF66 de build_weekly_report.js, más la misma versión en
   texto plano. Revisa que los números cuadren con los datos crudos.

6. Crea un draft de Gmail (nunca lo envíes) dirigido a
   alejandroortizotero@gmail.com con htmlBody y body en texto plano, sin
   adjuntos. Asunto: "Anuncios MotorLab | Semana <d> al <d> de <mes>".

7. Manda una notificación push avisando que el draft quedó listo para
   revisar y enviar.

Si algo falla de verdad (conector de Meta desconectado, datos vacíos,
error armando el HTML), no crees un draft a medias — manda una
notificación push describiendo el error específico en vez de un
reporte incompleto. Una falla del paso de Chatwoot NO cuenta como ese
tipo de falla (ver paso 3).
```

## Credenciales de Chatwoot

Configuradas 2026-10-12 como secreto "Chatwoot" del Environment Default
(tipo encabezado `api_access_token`, host `ml.reptilialab.com`, ruta
`/api/v1/`). El script usa curl para que pase por el proxy que inyecta el
encabezado; URL, cuenta, inboxes y teléfonos excluidos tienen default en
el script.
