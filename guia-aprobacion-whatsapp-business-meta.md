# Guía: aprobación de WhatsApp Business (Meta for Developers)

Este trámite es 100% externo — no es código, es un proceso administrativo con
Meta que tenés que hacer vos (crear cuentas, subir documentos del negocio,
verificar un número de teléfono). El código de Plataforma Agenda ya está listo
para consumirlo apenas tengas las credenciales: `src/lib/whatsapp.ts` ya arma
los payloads de las dos plantillas que necesitás, y solo está esperando estas
tres variables de entorno (`.env.example`):

- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- Los nombres de plantilla ya vienen con default: `recordatorio_cita` (idioma
  `es_MX`) y `seguimiento_recompra` (idioma `es_MX`).

## Decisión de arquitectura que ya está tomada en el código — leé esto primero

El código de hoy asume **una sola cuenta de WhatsApp Business para toda la
plataforma**: un único número de teléfono (`WHATSAPP_PHONE_NUMBER_ID`) envía
los mensajes de TODOS los tenants (todas las clínicas/psicólogos que usen
Plataforma Agenda). Esto significa que el cliente final va a ver el mensaje
llegando desde el nombre comercial que vos registres (ej. "Plataforma
Agenda"), no desde el nombre de la clínica específica que agendó.

Esto simplifica muchísimo el trámite: solo necesitás una cuenta, un número, y
tus propias plantillas. La alternativa (que cada tenant tenga su propio
número/nombre de WhatsApp Business, para que el mensaje le llegue al cliente
final como si viniera literalmente de "Clínica X") es una arquitectura
distinta y bastante más pesada — requiere que Plataforma Agenda se registre
como **Tech Provider / Solution Partner** ante Meta, implementar el flujo de
**Embedded Signup** para que cada tenant conecte su propia cuenta desde tu
producto, y pasar un **App Review** pidiendo "Advanced Access" sobre el
permiso `whatsapp_business_messaging` — sin esa aprobación, ese permiso ni
siquiera aparece disponible para que un cliente lo autorice. Nada de eso está
construido hoy ni hace falta para lo que ya armaste. Si en algún momento
querés ofrecer número propio por tenant como diferencial de producto, es un
prompt aparte y bastante más grande — no lo mezcles con este trámite.

## Paso 1 — Cuenta de Meta Business y verificación del negocio

1. Andá a **business.facebook.com** y creá (o confirmá que ya tenés) una
   cuenta de Meta Business con el nombre legal, dirección y datos fiscales
   reales de tu negocio.
2. Iniciá la **verificación de negocio** (Business Verification) desde el
   Centro de seguridad de esa cuenta: vas a tener que subir documentación
   oficial (registro de la empresa, comprobante de domicilio, etc. — varía
   según el país).
3. Los tiempos son variables y no los controlás: casos simples se resuelven
   en 1–5 días hábiles, pero para WhatsApp específicamente Meta puede tardar
   hasta 30 días. Planificá con margen — no asumas que vas a tener esto listo
   la misma semana. Podés monitorear el estado desde el Centro de seguridad
   de la cuenta.
4. Sin la verificación completa, la API funciona en modo limitado (útil solo
   para pruebas con números de teléfono agregados a mano como "testers"). Para
   mandar recordatorios reales a los clientes de tus tenants necesitás la
   verificación aprobada.

## Paso 2 — Crear la app y agregar el producto WhatsApp

1. En **developers.facebook.com**, creá una app nueva de tipo **Business**.
2. Dentro de la app, agregá el producto **WhatsApp** desde el catálogo de
   productos disponibles.
3. Al terminar el asistente inicial vas a llegar a una vista de "Empezar a
   usar la API", donde Meta te asigna automáticamente un número de prueba
   temporal (solo sirve para probar contra números "tester" agregados a
   mano, no para producción).

## Paso 3 — Número de teléfono dedicado para producción

1. Necesitás un número de teléfono real dedicado a esta cuenta de WhatsApp
   Business — **no puede ser un número que ya esté activo en la app normal
   de WhatsApp o en WhatsApp Business App** (a menos que lo migres
   formalmente, lo cual complica el trámite; lo más simple es usar un número
   que nunca haya tenido WhatsApp instalado).
2. Vas a tener que verificarlo recibiendo un código por SMS o llamada.
3. **Revisión del nombre para mostrar (display name):** el nombre que ven tus
   clientes finales en el chat (ej. "Plataforma Agenda") pasa por una
   revisión aparte de Meta, con sus propias reglas (tiene que representar de
   forma clara y honesta al negocio real, sin emojis raros ni texto
   promocional). Puede demorar por separado de la verificación de negocio.

## Paso 4 — Token permanente (no uses el token de prueba de 24h)

El token que te da el asistente inicial de la app expira en 24 horas — sirve
solo para probar a mano, nunca lo pongas en producción. Para el
`WHATSAPP_CLOUD_API_TOKEN` real necesitás un token permanente vía un
**System User**:

1. En Meta Business Suite → Configuración del negocio → **Usuarios → Usuarios
   del sistema**, creá un usuario del sistema con rol Admin (si no existe
   uno todavía).
2. Asigná la app de WhatsApp a ese usuario del sistema con control total
   ("Full control").
3. Generá el token desde ahí, seleccionando esa app y los permisos de
   WhatsApp necesarios. Ese token no expira — es el que va en tu `.env` de
   producción.
4. Guardalo con el mismo cuidado que cualquier otro secreto del proyecto
   (`STRIPE_SECRET_KEY`, `WOMPI_PRIVATE_KEY`, etc.) — nunca lo subas al
   repo.

El `WHATSAPP_PHONE_NUMBER_ID` lo encontrás en el panel de la app, en la
sección de WhatsApp → Números de teléfono (es un ID interno de Meta, no el
número de teléfono en sí).

## Paso 5 — Las dos plantillas que ya espera el código

El código ya tiene armados los payloads exactos para dos plantillas — vos
solo tenés que darlas de alta en el panel de WhatsApp Manager (Administrador
de WhatsApp → Plantillas de mensajes) con estos textos y variables, y
esperar la aprobación de Meta:

**1. `recordatorio_cita`** (recordatorio de cita, Fase 1) — 3 variables en
el cuerpo, en este orden exacto: nombre del cliente, nombre del servicio,
fecha/hora de la cita. Ejemplo de texto que podés registrar:

> Hola {{1}}, te recordamos tu cita de {{2}} el {{3}}. Si necesitás
> reprogramar, contactanos.

Esta debería calificar como categoría **Utility** (notificación
transaccional esperada por el cliente) — es la categoría que más rápido
aprueba Meta (frecuentemente en minutos, revisión automática; si un
revisor humano la toma, hasta 24h) y la más barata por mensaje.

**2. `seguimiento_recompra`** (aviso de recompra a cliente inactivo, Fase 5)
— 2 variables: nombre del cliente, nombre del negocio (tenant). Ejemplo:

> Hola {{1}}, te extrañamos en {{2}}. ¿Querés agendar tu próxima cita?

⚠️ **Punto de atención real, no solo trámite:** este mensaje es un
"queremos que vuelvas" sin que el cliente lo haya pedido en ese momento —
Meta clasifica ese tipo de contenido como **Marketing**, no Utility, casi con
seguridad. Eso implica: (a) revisión de aprobación más estricta y no
instantánea, (b) tarifa por mensaje más alta que Utility y sin ventana
gratuita de 24h, y (c) la política de mensajes de WhatsApp exige opt-in de
marketing del destinatario — hoy el CRM predictivo del proyecto no captura
ningún consentimiento explícito de marketing del cliente, solo que tuvo una
cita pasada. Antes de activar el envío real de esta plantilla en producción
convendría revisar si hace falta agregar ese opt-in (o replantear el
mensaje para que califique como Utility genuino), porque sin eso corrés
riesgo de que Meta rechace la plantilla o, peor, suspenda mensajería de la
cuenta por abuso de política. Esto es una decisión de producto/cumplimiento,
no algo que yo deba resolver por vos — lo dejo señalado para que lo decidas
con conocimiento antes de activarlo con clientes reales.

## Paso 6 — Cargar las credenciales

Una vez aprobadas ambas plantillas y con el token permanente en mano,
completá en tu `.env` de producción:

```
WHATSAPP_CLOUD_API_TOKEN="<el token permanente del system user>"
WHATSAPP_PHONE_NUMBER_ID="<el ID del número, no el número en sí>"
WHATSAPP_REMINDER_TEMPLATE_NAME="recordatorio_cita"
WHATSAPP_REMINDER_TEMPLATE_LANG="es_MX"
WHATSAPP_FOLLOWUP_TEMPLATE_NAME="seguimiento_recompra"
WHATSAPP_FOLLOWUP_TEMPLATE_LANG="es_MX"
```

Los nombres de plantilla y el idioma tienen que coincidir EXACTO (mismo
texto, mismas mayúsculas, mismo código de idioma) con lo que registraste en
WhatsApp Manager — si el idioma de la plantilla aprobada quedó como
`es` genérico en vez de `es_MX`, ajustá la variable de entorno para que
coincida, o el envío va a fallar con un error de "plantilla no encontrada".

## Sobre el costo (cambió recientemente, tenelo en cuenta para pricing)

Desde el 1 de julio de 2025, Meta cobra **por mensaje de plantilla
entregado**, no por ventana de conversación de 24h como antes. Utility y
Authentication tienen tarifa baja y son gratis si caen dentro de una ventana
de servicio ya abierta por el cliente; Marketing se cobra siempre, sin
descuento por volumen y a una tarifa más alta (en Latinoamérica/EE.UU. ronda
los 2.5¢ USD por mensaje de marketing, bastante menos por utility). Además,
desde el 1 de octubre de 2026 Meta empieza a cobrar también por mensajes de
servicio y utility dentro de la ventana de 24h que antes eran gratis — vale
la pena revisar esto contra tus planes/precios antes de escalar el volumen
de recordatorios automáticos.

## Checklist resumido

- [ ] Cuenta de Meta Business creada con datos legales reales.
- [ ] Verificación de negocio iniciada (dejá margen de días/semanas).
- [ ] App tipo Business creada en developers.facebook.com, producto
      WhatsApp agregado.
- [ ] Número de teléfono dedicado (nunca usado en WhatsApp normal) verificado.
- [ ] Nombre para mostrar aprobado.
- [ ] System user creado, token permanente generado.
- [ ] Plantilla `recordatorio_cita` (3 variables, es_MX) enviada y aprobada.
- [ ] Plantilla `seguimiento_recompra` (2 variables, es_MX) enviada y
      aprobada — con la decisión de opt-in/Marketing ya resuelta.
- [ ] `.env` de producción completado con token, phone number id, y nombres
      de plantilla exactos.
- [ ] Prueba real: completar el flujo de reserva pública con una cita a 24h+
      y confirmar que `/api/cron/send-reminders` efectivamente entrega el
      WhatsApp (hasta ahora solo se probó el encolado, nunca el envío real).

## Fuentes consultadas

- [WhatsApp Cloud API Get Started — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta Business Verification: A step-by-step guide (Wati.io)](https://support.wati.io/en/articles/11462440-meta-business-verification-a-step-by-step-guide)
- [How Long Meta Business Verification Usually Takes (duochat)](https://www.duochat.in/help-center/get-verified-with-facebook/how-long-meta-business-verification-usually-takes)
- [WhatsApp template categories explained: Utility, Authentication, and Marketing (Wati.io)](https://support.wati.io/en/articles/11463465-whatsapp-template-categories-explained-utility-authentication-and-marketing)
- [WhatsApp Cloud API Permanent Access Token — Step-by-Step (System User)](https://anjoktechnologies.in/blog/-whatsapp-cloud-api-permanent-access-token-step-by-step-system-user-2026-complete-correct-guide-by-anjok-technologies)
- [Access Tokens Guide — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [Solution Partner / Advanced Access — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)
- [WhatsApp Business API Pricing 2026: Conversation Categories, Costs, and What Changed (Blueticks)](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp Marketing Message Pricing in 2026 (Blueticks)](https://blueticks.co/blog/whatsapp-business-pricing-marketing-messages-2026)
