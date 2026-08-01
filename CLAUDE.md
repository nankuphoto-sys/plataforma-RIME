# Contexto del proyecto para Claude Code

Este archivo se lee automáticamente por Claude Code al abrir el proyecto en VS Code.
Mantenlo actualizado: es la "memoria" persistente del proyecto entre sesiones.

## Qué estamos construyendo

Una plataforma de agendamiento, CRM y pagos para negocios de salud y bienestar,
pensada como alternativa mejor a AgendaPro. Nicho inicial de go-to-market:
**salud especializada** (psicólogos, nutricionistas, fisioterapeutas, clínicas
pequeñas/medianas) — es el hueco que AgendaPro deja mal servido (fichas
clínicas genéricas, sin CIE-10, sin plantillas por especialidad).

Diferenciadores clave frente a AgendaPro (no los rompas al implementar features):
1. **Precio transparente**: sin add-ons obligatorios para funciones básicas de
   WhatsApp/recordatorios. Si se agrega un límite de uso, debe ser generoso y visible.
2. **Permisos granulares por sede desde el día 1** (`StaffLocationRole`), no un
   parche posterior.
3. **Ficha de cliente configurable por vertical** vía `Client.customFields` (JSONB),
   no un esquema rígido.
4. **Pagos nativos con confirmación en tiempo real** (webhook), nunca con demora
   de días como reportan usuarios de AgendaPro.
5. **CRM predictivo**, no solo manual: la lógica de recompra/seguimiento debe
   poder disparar recordatorios automáticos por inactividad, no solo por cumpleaños.

## Stack

- Next.js (App Router) + TypeScript — un solo repo para frontend y API.
- PostgreSQL + Prisma como ORM (schema-first).
- Tailwind CSS para estilos.
- Auth: Auth.js v5 (`next-auth`) con `@auth/prisma-adapter` y provider de
  Credentials (email + contraseña contra `User.passwordHash` con bcryptjs).
  Sesión JWT con `tenantId` y `StaffLocationRole` embebidos (solo para UI —
  las mutaciones re-verifican permisos contra la base de datos).
- Pagos: Stripe (internacional) + Wompi (Colombia, Bancolombia) — modelo `Payment`
  contempla ambos proveedores vía el enum `PaymentProvider`. Se eligió Wompi en vez
  de Mercado Pago por menor fricción de cuenta/integración para el mercado
  colombiano inicial.
- WhatsApp: WhatsApp Business Cloud API (Meta oficial) — modelo `NotificationQueue`
  ya contempla el canal.

## Convenciones

- Todo modelo de negocio cuelga de `tenantId` (multi-tenant). Nunca hagas una
  query que cruce tenants sin querer — siempre filtrar por `tenantId`.
- Los permisos se validan a nivel de `locationId`, no solo `tenantId`. Un
  `STAFF` o `PROFESSIONAL` no debe ver datos de otra sede del mismo tenant.
- Los campos "flexibles" (ficha clínica, ficha estética, etc.) van en `Json`
  (`customFields`), no como columnas nuevas — evita migraciones por cada vertical.
- Nombres de archivos y componentes en inglés, textos de UI en español (mercado LatAm).
- Cada módulo nuevo (agenda, CRM, pagos, reportes) debe llevar tests básicos
  (Vitest para lógica, Playwright para flujos críticos como "crear cita" y "cobrar").

## Fases (ver también `../plan-tecnico-plataforma.md`)

0. Cimientos (este scaffold): schema multi-tenant + RBAC por sede. ✅ hecho.
1. Agenda pública 24/7 + agenda interna. ✅ hecho, incluyendo recordatorios
   automáticos por WhatsApp (Meta Cloud API directa, no Twilio — ver
   `src/lib/whatsapp.ts`, `src/lib/reminderScheduling.ts`,
   `src/app/api/cron/send-reminders/route.ts`). Al reservar por la agenda
   pública se encola un `NotificationQueue` (canal WHATSAPP) 24h antes de la
   cita si hay teléfono válido y la cita es en 24h o más; el endpoint
   `/api/cron/send-reminders` (protegido por `CRON_SECRET`) procesa los
   pendientes vencidos y envía el mensaje de plantilla vía la API de Meta.
   Verificado en vivo el encolado y el manejo de errores sin credenciales
   reales. **Actualización (sesión de Cowork, 31 jul 2026):** el envío real
   de un WhatsApp ya se probó con éxito contra la API real de Meta (ver
   sección "Integración de WhatsApp Business (Meta) — sesión de Cowork" más
   abajo) — sigue pendiente la aprobación de las plantillas propias
   ("recordatorio_cita", "seguimiento_recompra") y el número de producción,
   no ya la prueba técnica de envío.
   Incluye login + permisos por sede (Auth.js v5, `requireDashboardAccess`). ✅ hecho.
2. CRM con ficha configurable por vertical ✅ hecho — `Tenant.vertical`
   (`TenantVertical`: GENERAL/PSICOLOGIA/NUTRICION/FISIOTERAPIA/ESTETICA) más
   plantillas fijas de campos por vertical en `src/lib/clientFieldTemplates.ts`,
   guardadas en `Client.customFields` con whitelist de keys al crear/editar
   (`src/app/dashboard/[tenantSlug]/clients/actions.ts`). CRUD de clientes con
   historial de citas en `src/app/dashboard/[tenantSlug]/clients/`, verificado
   en vivo (edición de un campo de la ficha, persistencia confirmada). El
   constructor de campos personalizado por tenant (más allá de las 5
   plantillas fijas) queda fuera de esta fase.
3. Pagos nativos: Stripe ✅ hecho (Checkout hosted + webhook con confirmación
   en tiempo real, ver `src/lib/stripe.ts`, `src/app/api/webhooks/stripe/route.ts`).
   Wompi (Colombia) ✅ hecho — Web Checkout hospedado + confirmación por API al
   volver (`src/lib/wompi.ts`, `src/lib/wompiPayment.ts`,
   `src/app/api/webhooks/wompi/route.ts`) verificado de punta a punta con
   pago real en sandbox (tarjeta de prueba aprobada → Payment PAID →
   Appointment CONFIRMED visible en el dashboard). Nota para desarrollo local:
   Wompi bloquea (403 de CloudFront) cualquier `redirect-url` que apunte a
   `localhost`, así que para probar el checkout completo en local hay que
   levantar un túnel público (ngrok) y entrar a la app por esa URL en vez de
   `localhost` — `createWompiCheckoutAction` ya arma la URL de retorno desde
   el header `host` de la petición, así que no requiere cambios de código.
4. Reportes y comisiones ✅ hecho — `src/app/dashboard/[tenantSlug]/reports/page.tsx`
   (acceso restringido a OWNER/ADMIN vía `requireReportsAccess` en
   `src/lib/auth-guards.ts` + `hasAnyOfRolesInTenantLocations` en
   `src/lib/authorization.ts`, 404 en vez de 403). Filtro por rango de fechas
   (`from`/`to`, default: mes calendario actual) anclado siempre a
   `Appointment.startsAt` — nunca a fecha de creación ni de confirmación del
   pago. Tres secciones: (1) conteo de citas por estado; (2) ingresos
   cobrados desde `Payment.status: "PAID"`, agrupados por proveedor+moneda
   sin sumar nunca montos de distinta moneda entre sí (Stripe usd y Wompi COP
   se muestran como filas separadas — verificado en vivo con pagos reales de
   ambos proveedores en el mismo rango); (3) comisión por profesional,
   calculada sobre `Service.price` de citas `COMPLETED` (nunca sobre
   `Payment.amount`, para que funcione igual en negocios que cobran en
   efectivo) vía `calculateCommissionAmount` en `src/lib/reports.ts`, con
   `Professional.commissionRate` editable inline desde la misma página
   (`updateProfessionalCommissionRateAction`, preserva el rango de fechas al
   guardar). Link "Reportes" en el dashboard solo visible para OWNER/ADMIN.
   Fuera de esta fase: exportar a CSV/PDF, gráficos, comisión por servicio
   individual, tracking de "comisión pagada".
5. Multi-sede avanzado (parte 1/2: gestión de sedes) ✅ hecho — nuevo modelo
   `ProfessionalLocation` (espejo de `ProfessionalService`) para asignar
   profesionales a sedes específicas del mismo tenant (relación no
   exclusiva). Migración con backfill de datos: cada profesional existente
   quedó asignado a toda sede donde ya tuviera una cita, y si no tenía
   ninguna, a la sede más antigua de su tenant — verificado en vivo que
   ningún profesional quedó huérfano de sede. Gestión de sedes en
   `src/app/dashboard/[tenantSlug]/locations/` (listar, crear, editar
   nombre/dirección/timezone + checklist de profesionales asignados en un
   solo formulario), restringida a rol OWNER vía `requireOwnerAccess` en
   `src/lib/auth-guards.ts` (ADMIN puede ver Reportes pero no Sedes — 404,
   no 403). El set-replace de asignaciones (`deleteMany` + `upsert` en
   transacción) fue probado en vivo en ambas direcciones (desasignar y
   reasignar un profesional), confirmando que persiste correctamente. Link
   "Sedes" en el dashboard visible solo para OWNER.
   Parte 2/2 (selector de sede real) ✅ hecho — en la agenda interna
   (`src/app/dashboard/[tenantSlug]/page.tsx`) el selector solo aparece si
   el usuario tiene acceso (`hasLocationAccess`) a 2+ sedes; con una sola
   sede el comportamiento es idéntico al de antes de esta fase (verificado
   en vivo). En el booking público (`src/app/(public)/[tenantSlug]/`),
   `BookingWizard.tsx` agrega un paso "sede" solo si el tenant tiene 2+
   sedes, y filtra profesionales por servicio Y sede a la vez (`serviceIds`
   + `locationIds`) — verificado en vivo con el tenant demo (Sede
   Principal / Sede Norte): el paso de sede aparece, elegir "Sede Norte"
   filtra correctamente al único profesional asignado ahí y los horarios
   cargan sin errores. `getAvailableSlotsAction` y `createAppointmentAction`
   ahora reciben `locationId` explícito y revalidan server-side que la sede
   pertenece al tenant y que el profesional está asignado a ella (nunca
   confían en el filtrado del navegador). El estado post-pago
   (`postCheckout`) ahora usa la sede real de la cita
   (`appointment.location`) en vez de `tenant.locations[0]`.
   `createCheckoutSessionAction`/`createWompiCheckoutAction` no se tocaron.
   Fuera de esta fase: servicios específicos por sede (`Service` sigue
   siendo tenant-wide), borrado de sedes, gestión de `StaffLocationRole`
   (invitar usuarios STAFF/ADMIN/PROFESSIONAL a una sede sigue siendo manual).
   Fix aparte ✅ hecho — crear una sede nueva ahora le da acceso `OWNER`
   automático a todo usuario que ya sea `OWNER` en alguna otra sede del
   mismo tenant (no solo al usuario de la sesión actual, por si el tenant
   tiene más de un OWNER), dentro de la misma transacción que crea la sede
   (`createLocationAction` en
   `src/app/dashboard/[tenantSlug]/locations/actions.ts`). Ya no hace falta
   asignar el `StaffLocationRole` a mano vía Prisma Studio para este caso.
   Verificado en vivo: creada una sede de prueba como `owner@demo.com`,
   cerrada sesión y vuelto a entrar (el JWT de Auth.js solo carga
   `locationRoles` al hacer login, así que hace falta refrescarlo para ver
   el cambio), y la sede nueva ya aparecía en el selector de sede de
   Inventario sin haber tocado la base de datos a mano.
   CRM predictivo de recompra ✅ hecho — reutiliza toda la infraestructura de
   WhatsApp de la Fase 1, sin tocar su comportamiento. `NotificationQueue`
   ganó un campo `clientId` opcional (espejo de `appointmentId`): un
   recordatorio de cita siempre tiene `appointmentId` y `clientId` null; un
   aviso de recompra siempre tiene `clientId` y `appointmentId` null — nunca
   ambos. Regla de negocio en `src/lib/reengagement.ts`
   (`isClientInactive`): candidato si tuvo al menos una cita `COMPLETED`,
   no tiene ninguna cita futura no cancelada, y pasaron 60+ días desde su
   última `COMPLETED` (constante fija en código, no configurable por tenant
   en esta fase). `src/lib/whatsapp.ts` se refactorizó para poder mandar un
   segundo tipo de plantilla (`buildFollowUpTemplatePayload`,
   `sendFollowUpWhatsAppMessage`) sin cambiar la firma ni el comportamiento
   de `sendWhatsAppTemplateMessage` — verificado que `send-reminders` sigue
   respondiendo igual que antes. Dos crons nuevos protegidos por
   `CRON_SECRET`: `/api/cron/detect-inactive-clients` (escanea clientes,
   aplica la regla, deduplica contra avisos `SCHEDULED` o `SENT` dentro de
   un cooldown de 90 días, y encola) y `/api/cron/send-followup-reminders`
   (envía los avisos vencidos). Verificado en vivo: ambos responden
   limpiamente contra la base real (`scanned:6, enqueued:0` /
   `processed:0` con el estado actual, sin clientes elegibles); el propio
   Claude Code había verificado antes con un cliente backdateado
   temporalmente que sí encola (`enqueued:1`), que la segunda corrida no
   duplica (`enqueued:0`), y que sin credenciales reales de Meta la fila
   queda `FAILED` con el mismo mensaje que los recordatorios de cita.
   Fuera de esta fase: página en el dashboard para ver clientes inactivos,
   umbral configurable por tenant, conexión a un cron real (Vercel Cron,
   etc.), envío real de WhatsApp (sigue pendiente la cuenta de Meta
   Business + plantilla aprobada, igual que los recordatorios de cita).
   Inventario ✅ hecho — módulo nuevo desde cero: `InventoryItem` (catálogo
   por tenant, nombre/unidad libre/umbral de stock bajo/`active`),
   `InventoryStock` (saldo actual único por `itemId`+`locationId`) e
   `InventoryMovement` (historial de entradas/salidas, cantidad siempre
   positiva, `type` da el signo, `createdByUserId` opcional). Descuento de
   stock manual (sin vínculo con `Service`/`Appointment` ni descuento
   automático al completar una cita — decisión explícita para esta fase) y
   alertas de stock bajo solo visuales (badge en la UI, sin WhatsApp).
   Dos niveles de permiso: cualquiera con acceso a una sede
   (`hasLocationAccess`) puede ver su stock y registrar movimientos ahí
   (para que STAFF de recepción pueda anotar consumo del día a día); crear o
   editar el catálogo de ítems requiere OWNER/ADMIN vía
   `requireInventoryManageAccess` en `src/lib/auth-guards.ts`. La lógica de
   movimiento (`recordInventoryMovementAction`) corre en una transacción que
   valida ítem y sede contra el tenant, rechaza una salida mayor al stock
   actual sin crear nada, y si es válida actualiza `InventoryStock` y crea
   el `InventoryMovement` — verificado en vivo end-to-end: una entrada de 10
   se reflejó correctamente, una salida de 20 fue rechazada con el mensaje
   esperado sin tocar el stock, y una salida válida de 8 dejó el stock en 2
   y mostró el badge "Stock bajo" (umbral 3) con el historial de
   movimientos en el orden correcto. Páginas en
   `src/app/dashboard/[tenantSlug]/inventory/`, con el mismo selector de
   sede (`?locationId=`) que ya usa la agenda interna. Link "Inventario" en
   el dashboard visible para cualquier usuario con acceso (no solo
   OWNER/ADMIN).
   Fuera de esta fase: vínculo servicio↔insumo y descuento automático por
   cita, alertas por WhatsApp, categorías/proveedores/costos, reportes de
   consumo, borrado de ítems o movimientos.

Con esto, los tres bloques de la Fase 5 (multi-sede avanzado, CRM
predictivo de recompra, inventario) quedan completos.
6. Feature-gating por plan (parte 1/N) ✅ hecho — `src/lib/planLimits.ts`
   centraliza los límites definidos en "Qué falta por decidir" (`PLAN_LIMITS`
   por `Plan`, `getPlanLimits`, `planIncludesModule`, `hasReachedLocationLimit`),
   con un comentario explícito de que el tope de profesionales activos queda
   deliberadamente fuera: no existe ninguna pantalla para crear/activar/
   desactivar `Professional` todavía (solo se crean vía `prisma/seed.ts`).
   El plan y el status de cada tenant se siguen asignando a mano en Prisma
   Studio — no hay cobro automático, suscripciones Stripe/Wompi para el
   SaaS, ni upgrade/downgrade self-service en esta fase.
   Tope de sedes: `createLocationAction` bloquea antes de tocar la base si
   `hasReachedLocationLimit`, con mensaje `"Tu plan (X) permite hasta N
   sede(s). Sube de plan para agregar más."`; `locations/page.tsx` muestra
   el uso ("N de M sedes usadas...") y oculta "+ Nueva sede" al llegar al
   tope (la ruta `/locations/new` sigue siendo alcanzable directamente,
   pero el submit queda bloqueado por la acción). Verificado en vivo con
   el tenant demo en PREMIUM (3/3 sedes): link oculto, mensaje de límite
   visible, y forzar el submit fue bloqueado con el mensaje exacto sin
   crear nada.
   Gating de módulos vía `src/lib/auth-guards.ts`: nuevo
   `requireInventoryAccess` (chequea `planIncludesModule(tenant.plan,
   "inventory")`, si no redirige a `/plan-required?feature=inventario&
   requiredPlan=PREMIUM`); `requireInventoryManageAccess` ahora pasa por
   él antes de exigir OWNER/ADMIN; `requireReportsAccess` suma el mismo
   chequeo para `"reports"` (`requiredPlan=BASICO`). El chequeo de plan
   vive también dentro de `recordInventoryMovementAction` (vía
   `requireInventoryAccess`, no solo en las páginas), porque las Server
   Actions se pueden invocar sin pasar por la página — mismo principio de
   "las mutaciones re-verifican permisos" que ya sigue el proyecto. Nueva
   página `plan-required/` (requiere `requireDashboardAccess`, no es
   pública) que muestra el plan actual y el mínimo requerido según los
   query params `feature`/`requiredPlan`. Verificado en vivo navegando
   directo a la ruta con distintos query params.
   CRM predictivo: `detect-inactive-clients` filtra la query de clientes
   por `tenant.plan` dentro del set de planes que incluyen
   `"reengagement"` (derivado de `PLAN_LIMITS`, no hardcodeado) — un
   tenant sin el módulo ni se escanea ni cuenta en `scanned`. No se tocó
   `send-followup-reminders` (solo envía avisos ya encolados).
   Bloqueo duro por `PAST_DUE`/`CANCELLED`: `requireDashboardAccess`
   redirige a `/account-locked` apenas confirma que el tenant es el del
   usuario logueado, antes del chequeo de rol — esto bloquea automática y
   centralmente TODO el dashboard interno (agenda, clientes, reportes,
   sedes, inventario) porque todos esos guards pasan por ahí. La página
   `account-locked/` deliberadamente NO usa `requireDashboardAccess` (para
   no crear un loop de redirects contra sí misma) — tiene su propio
   chequeo liviano de sesión + tenant, verificado en vivo que carga sin
   loop. La carpeta `(public)` no menciona `Tenant.status` en ningún
   lado, así que la agenda pública de reservas sigue funcionando igual
   cuando el tenant está bloqueado.
   Fuera de esta fase (en ese momento): tope de profesionales activos
   (pendiente de una pantalla de gestión de profesionales — ver más abajo,
   ya resuelto), cobro automático/suscripciones reales, upgrade/downgrade
   self-service, cualquier flujo de reactivación de cuenta más allá del
   mensaje estático en `account-locked`.
   Gestión de profesionales ✅ hecho — módulo nuevo desde cero (sin
   migración de Prisma: `Professional`, `ProfessionalService` y
   `ProfessionalLocation` ya existían con lo necesario). Páginas en
   `src/app/dashboard/[tenantSlug]/professionals/` (lista, `new/`,
   `[professionalId]/`) detrás de `requireProfessionalsManageAccess`
   (OWNER/ADMIN, sin chequeo de plan/módulo — es función core de todos los
   planes). El formulario de crear/editar incluye checklists de Servicios
   y Sedes que hacen set-replace transaccional de `ProfessionalService`/
   `ProfessionalLocation` (mismo patrón que `applyLocationProfessionalsUpdate`
   en sedes), validando que cada id pertenezca al tenant. Link
   "Profesionales" en el dashboard, visible para OWNER/ADMIN.
   Tope de profesionales activos por plan ✅ hecho ya en esta misma fase —
   `planLimits.ts` ganó `maxProfessionals` (INDIVIDUAL:1, BASICO:3,
   PREMIUM:8, PRO:sin límite) y `hasReachedProfessionalLimit`. Regla de
   negocio verificada en vivo: el tope nunca bloquea dejar/crear un
   profesional **inactivo**, sin importar cuántos activos haya; solo
   bloquea si el guardado dejaría al profesional `active: true` y eso
   superara el límite del plan — al editar, el conteo excluye al propio
   profesional que se está editando (si no, nunca podrías guardar cambios
   menores en un profesional que ya estaba activo y en el tope). Mensaje:
   `"Tu plan (X) permite hasta N profesional(es) activo(s). Desactiva otro
   profesional o sube de plan."` La lista de profesionales muestra el uso
   ("N de M profesionales activos..."), pero a diferencia de sedes el link
   "+ Nuevo profesional" nunca se oculta — crear uno inactivo siempre debe
   poder hacerse, esté o no el tenant en el tope.
   No se tocó `reports/actions.ts` ni `updateProfessionalCommissionRateAction`
   — la edición inline de comisión ahí sigue funcionando igual, coexiste
   sin conflicto con la nueva pantalla. No hay vínculo `Professional`↔`User`
   (invitar como login) en esta fase — sigue siendo una fase aparte, sin
   arrancar todavía. No hay borrado de profesionales (solo desactivar,
   igual que sedes e inventario). No hay pantalla de gestión de `Service`
   (crear/editar) — el checklist de servicios en el formulario de
   profesional solo lista los que ya existen (hoy solo se crean vía seed).
   Equipo (invitar usuarios a una sede) ✅ hecho — módulo nuevo desde cero,
   sin migración de Prisma (`User` y `StaffLocationRole` ya alcanzaban).
   Como no hay infraestructura de email en el proyecto (solo WhatsApp
   Cloud API para clientes finales), esto NO es un flujo de invitación por
   link mágico: el OWNER/ADMIN da de alta al usuario directo, con una
   contraseña temporal generada por el sistema (`crypto` de Node, hasheada
   con `bcryptjs`) que se muestra **una sola vez** vía una cookie httpOnly
   de `maxAge: 60`s (nunca en la URL/query param) — el OWNER se la pasa a
   la persona por fuera de la app. No hay flujo de "cambiar contraseña" ni
   "olvidé mi contraseña" todavía (hueco documentado, no resuelto en esta
   fase). Páginas en `src/app/dashboard/[tenantSlug]/team/` (lista, `new/`,
   `[userId]/`) detrás de `requireTeamManageAccess` (OWNER/ADMIN, devuelve
   también `isOwner`). El rol se asigna independiente por sede (tabla con
   un `<select>` por `Location`, fiel a que `StaffLocationRole` ya permite
   roles distintos por sede para el mismo usuario), no "un rol para todas
   las sedes marcadas".
   Regla anti-escalación de privilegios (porque se dejó entrar a ADMIN,
   no solo OWNER): un ADMIN no puede asignar el rol OWNER a nadie (la UI
   oculta esa opción en el select, y el server la bloquea igual si se
   fuerza el submit) ni editar a un usuario que ya tiene OWNER en alguna
   sede del tenant — ambas verificadas en vivo. Regla de auto-bloqueo: si
   quien edita se está editando a sí mismo y el resultado lo dejaría sin
   ninguna fila de `StaffLocationRole` en el tenant, se bloquea (verificada
   por revisión de código, no en vivo, para no arriesgar la sesión real de
   `owner@demo.com`).
   Detección de email duplicado al invitar: si el correo ya es de un
   usuario del mismo tenant, bloquea y sugiere editarlo desde la lista
   (verificado en vivo: el intento no creó una fila duplicada); si es de
   otro tenant, bloquea con mensaje genérico (un usuario nunca pertenece a
   más de un tenant, `User.tenantId` es fijo). "Sin acceso" en todas las
   sedes de un usuario ya cumple la función de revocar su acceso — no hay
   ni hace falta un flag de "usuario desactivado" ni borrado de `User`
   (verificado en vivo: revocar todas las sedes de un usuario de prueba lo
   dejó en "Sin acceso" en la lista, sin borrarlo). Link "Equipo" en el
   dashboard, visible para OWNER/ADMIN. No se tocó `Professional.userId`
   ni ningún vínculo profesional↔usuario — esta fase es solo sobre acceso
   al dashboard, no sobre la ficha de profesional.

Cobro automático del SaaS (Stripe Subscriptions) ✅ hecho y verificado en vivo
de punta a punta — `Tenant.stripeCustomerId`/`stripeSubscriptionId`,
`STRIPE_PRICE_INDIVIDUAL/BASICO/PREMIUM/PRO`, `src/lib/subscriptionPlans.ts`
(`getStripePriceId`), `requireBillingAccess` en `auth-guards.ts` (independiente
del hard-lock de `requireDashboardAccess`), `billing/actions.ts`
(`createSubscriptionCheckoutAction` + `createBillingPortalSessionAction`) y
`billing/page.tsx` (link "Facturación", solo OWNER). Una primera pasada dejó
sin implementar dos puntos críticos — `account-locked/page.tsx` no ofrecía
forma de reactivar pago, y el webhook de Stripe no tenía ninguna rama para
suscripciones — detectado por revisión de código independiente (no por el
resumen de la sesión que los daba por hechos) y corregido vía
`prompt-cobro-automatico-fix.md`: `account-locked/page.tsx` ahora muestra un
botón "Actualizar método de pago" (solo si `tenant.stripeCustomerId` existe)
que llama a `createBillingPortalSessionAction`; `src/app/api/webhooks/stripe/route.ts`
ganó una rama `mode === "subscription"` dentro de `checkout.session.completed`
(distinguida por `client_reference_id` = id del tenant, sin tocar la rama
existente de pagos de citas por `Payment.providerRef`) más `invoice.paid`,
`invoice.payment_failed` y `customer.subscription.deleted`, todas con
`prisma.tenant.updateMany({ where: { stripeSubscriptionId } })` — incluye un
helper `getInvoiceSubscriptionId` para el cambio de esquema de Stripe ("Basil",
`invoice.parent.subscription_details.subscription` en vez de
`invoice.subscription`).

Verificación en vivo (no solo revisión de código): como no había ningún
Price de Stripe creado todavía, se crearon manualmente los 4 productos en el
Dashboard de Stripe en modo de prueba (Recurrente/Mensual/USD, categoría
fiscal "Software como servicio (SaaS): uso comercial") y sus Price IDs se
cargaron en `.env`. Con `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
corriendo (mismo `STRIPE_WEBHOOK_SECRET` ya configurado), se completó un
Checkout real para el tenant demo (PREMIUM) con la tarjeta de prueba
4242 4242 4242 4242: confirmado en Prisma Studio que quedó
`stripeCustomerId`, `stripeSubscriptionId` y `status: ACTIVE`. Luego, desde el
Dashboard de Stripe, se canceló esa misma suscripción real (no un evento
`stripe trigger` genérico y desconectado) — se confirmó que
`customer.subscription.deleted` movió el tenant a `status: CANCELLED`, que
entrar a `/dashboard/consultorio-demo` redirige a `account-locked`, que ahí
aparece el botón "Actualizar método de pago", y que al clickearlo abre una
sesión real del Billing Portal de Stripe. No se disparó en vivo
`invoice.payment_failed` en esta sesión (requeriría cambiar el método de pago
por defecto a una tarjeta de rechazo antes de forzar el siguiente ciclo de
facturación) — queda verificado solo por revisión de código, con el mismo
patrón `prisma.tenant.updateMany` ya probado en vivo para las otras dos ramas.
Tampoco se re-probaron en esta sesión los pagos de citas de clientes finales
(Stripe modo `payment` / Wompi), pero la rama original de
`checkout.session.completed` para `Payment.providerRef` no se tocó — la nueva
lógica de suscripción hace `return` antes de llegar a esa rama, así que no
puede interferir con ella.

Nota aparte, no ligada a esta fase: durante la verificación un comando de
Prisma corrido con `--shadow-database-url` apuntando por error al
`DATABASE_URL` real de Neon vació todas las filas de la base de datos
(la estructura de tablas quedó intacta). Se recuperó con un point-in-time
restore de Neon a un timestamp exacto ubicado por búsqueda binaria con la
función de "preview de datos históricos" de Neon (sin necesidad de restaurar
a ciegas), seguido de `prisma migrate deploy` (nunca `migrate dev`, y sin
ningún flag de shadow database) para reaplicar la migración de los campos de
Stripe que el restore había revertido. Verificado en vivo con dos métodos
independientes (Neon SQL Editor y Prisma Studio) que los datos y las 9
migraciones quedaron completos. Lección para no repetir: `--shadow-database-url`
nunca debe apuntar a una base de datos real — Prisma la trata como
completamente desechable.

Fuera de esta fase (en ese momento): cobro recurrente vía Wompi, cualquier
flujo de self-service signup para tenants nuevos, selector de cambio de
plan en la UI, y disparar `invoice.payment_failed` en vivo. El selector de
cambio de plan se resolvió después (ver más abajo, "Cambio de plan
self-service").

Self-service signup para tenants nuevos ✅ hecho y verificado en vivo de punta
a punta, siguiendo `prompt-self-service-signup.md`. Ruta pública `/signup`
(`src/app/signup/page.tsx`) con formulario de negocio/rubro/plan (precios y
límites vía `getPlanLimits` de `planLimits.ts`, sin hardcodear) + datos del
owner + primera sede. `src/app/signup/actions.ts` (`signUpTenantAction`):
valida todos los campos (incluyendo formato de email y confirmación de
contraseña), rechaza email ya usado por **cualquier** tenant (`User.email` es
único globalmente), genera `slug` vía `slugify` (NFD + strip de marcas
combinantes + lowercase + guiones) con sufijo numérico incremental si ya
existe, y en una única transacción de Prisma crea `Tenant` (`status: "TRIAL"`,
nunca `ACTIVE`) + primera `Location` + `User` (bcryptjs, mismo patrón que
Equipo) + `StaffLocationRole` con rol `OWNER`. Redirige a
`/login?signup=success` (sin login automático — el usuario entra por el flujo
normal de Auth.js); `src/app/login/page.tsx` muestra "Cuenta creada
correctamente, inicia sesión" cuando ese query param está presente, sin
romper el login existente. No toca `billing/actions.ts`, `billing/page.tsx`,
`subscriptionPlans.ts`, el webhook de Stripe, ni `requireDashboardAccess` — un
tenant en `TRIAL` ya entra al dashboard sin cambios adicionales, y el cobro se
configura después desde Facturación como cualquier tenant existente.

Verificación en vivo (no solo revisión de código): se completó el flujo
completo dos veces contra la base real vía el navegador. (1) Signup con
negocio "Clinica QA Uno" / plan BASICO → redirigió a `/login?signup=success`
con el mensaje visible; en Prisma Studio se confirmó exactamente un `Tenant`
nuevo (`status: TRIAL`, plan BASICO correcto), una `Location`, un `User` con
`passwordHash` en formato bcrypt (no texto plano) y un `StaffLocationRole`
con rol `OWNER` apuntando a esa sede — los cuatro registros creados en la
misma transacción y correctamente enlazados por id. (2) Repetir el signup con
el mismo nombre de negocio ("Clinica QA Uno", plan INDIVIDUAL esta vez)
generó el tenant con `slug: "clinica-qa-uno-2"`, confirmando el sufijo
numérico sin error. (3) Intentar registrarse de nuevo con el email ya usado
fue bloqueado con el mensaje exacto "Ese correo ya tiene una cuenta. Inicia
sesión en vez de registrarte." sin crear ningún tenant nuevo (confirmado que
el conteo de tenants no cambió). (4) Iniciar sesión con las credenciales
recién creadas entró directo a `/dashboard/clinica-qa-uno` sin redirigir a
`account-locked` (TRIAL no está en el hard-lock). (5) `/dashboard/
clinica-qa-uno/billing` mostró "Plan actual: BASICO" / "Estado: TRIAL" con el
botón "Configurar cobro automático", igual que cualquier tenant existente.
(6) En `/dashboard/clinica-qa-uno/locations` (plan BASICO, tope de 1 sede) se
confirmó el mensaje "1 de 1 sede usadas en tu plan BASICO..." sin el link
"+ Nueva sede"; forzando la ruta `/locations/new` directamente y enviando el
formulario, el server bloqueó la creación con el mensaje exacto "Tu plan
(BASICO) permite hasta 1 sede. Sube de plan para agregar más." sin crear
ninguna sede — confirmando que el gating por plan aplica desde el primer
momento sin cambios adicionales al código ya existente de `locations/actions.ts`.
Los dos tenants de prueba (y su sede, usuario y rol asociados) se eliminaron
al terminar desde Prisma Studio (el delete de `Tenant` hizo cascade sobre
`Location`/`User`/`StaffLocationRole` automáticamente); se confirmó que
`consultorio-demo` volvió exactamente a su estado previo (1 tenant, 3 sedes,
2 usuarios, sin cambios en sus datos).

Cambio de plan self-service (upgrade/downgrade) ✅ hecho y verificado,
siguiendo `prompt-cambio-plan.md`. `src/lib/subscriptionPlans.ts` ganó
`getPlanFromStripePriceId` (mapeo inverso Price→Plan, devuelve `null` sin
tirar error si no matchea — el webhook puede recibir eventos de suscripción
que no son un cambio de plan). `PLAN_OPTIONS`/`describePlan()` se movieron
de `src/app/signup/page.tsx` a `src/lib/planDisplay.ts` compartido, sin
cambiar el comportamiento de `/signup`. `billing/actions.ts` ganó
`changeSubscriptionPlanAction(tenantSlug, newPlan)`: revalida `newPlan`
contra el enum (no confía en el tipo, se invoca desde un `<form>`), bloquea
si no hay `stripeSubscriptionId` o si `newPlan === tenant.plan`, y llama a
`stripe.subscriptions.update` con `proration_behavior: "create_prorations"`
— el cambio (upgrade o downgrade) se aplica siempre de inmediato, nunca
diferido a Subscription Schedules ni al próximo ciclo. Deliberadamente NO
actualiza `Tenant.plan` de forma optimista: la única fuente de verdad es
una rama nueva del webhook (`customer.subscription.updated`), que lee el
`price.id` del primer subscription item, lo mapea con
`getPlanFromStripePriceId`, y si matchea actualiza solo `plan` (nunca
`status`, que sigue siendo exclusivo de `invoice.paid`/
`invoice.payment_failed`/`customer.subscription.deleted`). `billing/page.tsx`
agrega una sección "Cambiar de plan" (solo visible con suscripción activa)
con los 4 planes, el actual marcado sin botón, y aviso de prorrateo.

Decisión de producto explícita: si el downgrade deja al tenant con más
sedes o profesionales activos que el límite del plan nuevo, el cambio se
permite igual — nunca se bloquea ni se desactiva nada automáticamente
(las sedes ni siquiera tienen un mecanismo de desactivación, así que
bloquear el downgrade las dejaría atrapadas en el plan viejo para
siempre). Solo se muestra una advertencia informativa en `/billing`
calculando `locationCount`/`activeProfessionalCount` contra
`getPlanLimits(option.value)`. El enforcement real no se tocó y sigue
haciendo su trabajo solo: `hasReachedLocationLimit`/
`hasReachedProfessionalLimit` bloquean crear/activar más recursos mientras
el tenant siga por encima del tope, exactamente igual que antes de esta
fase.

Verificado en vivo por Claude Code (Stripe test mode real, `stripe listen`
reenviando al webhook): suscripción BASICO → upgrade a PREMIUM vía el form
real confirmó en Stripe el cambio de Price + ítems de prorrateo, el webhook
actualizó `Tenant.plan` a PREMIUM, y el acceso a Inventario se habilitó en
la misma sesión sin reloguear (el gating de módulos lee `tenant.plan` de la
base en cada request, no del JWT). Downgrade PREMIUM→BASICO con 3 sedes
existentes (límite de BASICO: 1) se permitió, `Tenant.plan` quedó en
BASICO, ninguna sede se tocó, y `/locations` mostró el tope alcanzado con
el link de crear oculto — el enforcement reaccionó solo, sin código nuevo
para eso. Forzar el mismo plan fue bloqueado server-side
(`error=mismo-plan`) sin llamar a Stripe. `/signup` renderiza idéntico tras
la extracción de constantes compartidas. Al terminar, canceló la
suscripción/customer de prueba y devolvió el tenant demo a su estado
original. Revisión de código independiente confirmó que cada rama coincide
con lo verificado (sin `Tenant.status` tocado por la rama nueva del
webhook, sin desactivaciones automáticas, `redirect()` corta la ejecución
igual que en las acciones existentes). Dos notas menores sin resolver, no
bloqueantes: `subscriptionItemId` asume que la suscripción siempre tiene
exactamente un item (cierto hoy, no validado explícitamente si algún día
dejara de serlo), y no hay test unitario para `getPlanFromStripePriceId`
(sí existe para `planLimits.ts`).

Fuera de esta fase: Wompi recurrente, cambio de cantidad/prorrateo manual,
cualquier otro control de facturación más allá de elegir el plan destino.

Cobro recurrente vía Wompi (Colombia) ✅ hecho y verificado en vivo de punta
a punta — siguiendo `prompt-wompi-recurrente.md`. Arquitectura: modelo
nuevo `TenantWompiCharge` (deliberadamente separado de `Payment`/
`Appointment`, que siguen intactos — `Payment.appointmentId` es obligatorio
y único, atado a una cita, no servía para esto). `Tenant` ganó
`wompiPaymentSourceId`/`wompiCardLastFour`/`wompiNextChargeAt`/
`wompiRetryCount`/`wompiFirstFailedAt`. `src/lib/wompiSubscriptionPlans.ts`
(`getWompiPriceInCents`, mismo patrón que el de Stripe pero en centavos de
COP vía `WOMPI_PRICE_COP_<PLAN>`), `getWompiAcceptanceTokens` nuevo en
`wompi.ts` (consulta `GET /v1/merchants/{public_key}`, campos
`presigned_acceptance`/`presigned_personal_data_auth` confirmados contra la
API real de sandbox), y `src/lib/wompiSubscriptionCharge.ts`
(`chargeTenantWompiSubscription`, lógica de cobro compartida entre el setup
inicial y el cron mensual — dispara la transacción, nunca resuelve el
resultado de forma optimista, igual que con Stripe).

Dos ajustes al spec original, confirmados contra la API real de Wompi
sandbox (no eran errores del prompt en el sentido de mal diseño, sino
supuestos que no coincidían con el comportamiento real de la API):
`POST /v1/transactions` con `payment_source_id` requiere igual
`payment_method: { installments: 1 }` (sin eso, 422). `PUT
/payment_sources/{id}/void` no aplica a payment sources tipo `CARD` (solo
`PREAUTHORIZATION`, también 422) — Wompi no ofrece forma pública de
invalidar un payment source de cobro directo, así que
`cancelWompiSubscriptionAction` cancela 100% de nuestro lado
(`status: CANCELLED`, `wompiNextChargeAt: null`) sin llamar a ese endpoint;
alcanza porque el cron nunca vuelve a tomar un tenant sin `wompiNextChargeAt`.

Reintentos: `src/app/api/webhooks/wompi/route.ts` ganó una rama nueva
(`handleSubscriptionChargeUpdate`) que corre solo cuando la referencia del
evento NO matchea ningún `Payment` existente — la rama original que resuelve
pagos de citas de clientes finales no se tocó. Al aprobarse un cobro:
`status: ACTIVE`, `wompiNextChargeAt` +30 días, contador de reintentos en
cero. Al rechazarse: hasta 3 reintentos a +2/+4/+7 días desde el primer
rechazo del ciclo (`wompiFirstFailedAt`), `status: PAST_DUE` en el medio
(dispara el hard-lock existente igual que con Stripe), y `CANCELLED` si el
3er reintento también falla. Exclusión mutua con Stripe verificada en
ambos sentidos, en la UI de `/billing` y server-side en
`/api/wompi/tokenize-callback` y `/billing/wompi-setup`. `vercel.json`
nuevo conecta Vercel Cron a los 3 crons que ya existían más el nuevo
(`charge-wompi-subscriptions`) — no se pudo confirmar si el plan de Vercel
del proyecto permite la cadencia horaria prevista para `send-reminders`
(no hay proyecto de Vercel vinculado todavía); si termina siendo Hobby con
mínimo diario, hay que ajustar esa cadencia a mano en `vercel.json`.

Verificado en vivo (Stripe test mode real para las partes ya existentes,
Wompi sandbox real para esta fase, checksum HMAC real con
`WOMPI_EVENTS_SECRET` simulando el webhook porque no había túnel público
recibiendo webhooks reales): tokenización → payment_source `AVAILABLE` →
primer cobro → webhook `APPROVED` → tenant `ACTIVE`; cobro `DECLINED` →
`PAST_DUE` + hard-lock funcionando; reintentos agotados → `CANCELLED`;
exclusión mutua Stripe/Wompi en ambos sentidos; `cancelWompiSubscriptionAction`;
sin regresión en pagos de citas de clientes finales por Wompi (rama
original del webhook intacta).

**Verificación del widget de tokenización (el punto que quedaba pendiente)**:
confirmado en vivo contra el widget real de Wompi (`https://checkout.wompi.co/widget.js`,
modo `tokenize`, misma `data-public-key` de sandbox que usa el proyecto),
reproduciendo el flujo completo en un navegador real (llenar número de
tarjeta, expiración, CVC, nombre, aceptar los dos consentimientos, click en
"Guardar tarjeta") apuntando el `action` del formulario a un endpoint de
inspección en vez de `/api/wompi/tokenize-callback`, para poder ver el POST
real sin arriesgar datos del proyecto. El widget SÍ hace un submit de
formulario normal (no `postMessage` ni callback de JS) y el body recibido
fue exactamente `tenantSlug=test-tenant&payment_source_token=tok_test_...&payment_source_type=CARD` —
confirmando que el nombre de campo `payment_source_token` que ya usa
`src/app/api/wompi/tokenize-callback/route.ts` (`formData.get("payment_source_token")`)
es correcto tal cual está, sin necesidad de ningún cambio de código. Nota
menor sin actuar: el widget también manda `payment_source_type=CARD`, un
campo que el route handler no lee hoy — no hace falta leerlo porque este
flujo solo produce sources tipo `CARD` (`type: "CARD"` ya está hardcodeado
al llamar a `POST /v1/payment_sources`), pero queda documentado por si
algún día se agrega otro tipo de source.

Fuera de esta fase: 3DS/3RI, Credential On File, actualizar tarjeta (solo
configurar por primera vez y cancelar), cambio de plan self-service para
tenants en Wompi, reactivación después de `CANCELLED`, notificaciones por
WhatsApp/email ante un cobro rechazado.

Recuperación y cambio de contraseña ✅ hecho y verificado en vivo — siguiendo
`prompt-reset-password.md`. Hasta esta fase no existía forma de que un
usuario que ya tiene cuenta cambiara su contraseña logueado, ni de
recuperarla si la olvidaba — la única vía era invitar de nuevo desde Equipo
o tocar la base a mano. Se eligió un flujo self-service por **email con
link de recuperación** (nueva dependencia: `resend`, sender de sandbox
`onboarding@resend.dev`) por sobre "solo reseteo asistido por OWNER/ADMIN",
porque un tenant `INDIVIDUAL` (el segmento objetivo del producto) tiene un
único usuario — si ese usuario se bloquea sin nadie más con acceso, un
reseteo asistido no le sirve de nada. Se descartó un código por WhatsApp
porque hubiera requerido agregar teléfono a `User` y sumar OTRA plantilla a
aprobar por Meta, encima de la que ya está pendiente para recordatorios de
cita.

Arquitectura: nuevo modelo `PasswordResetToken` (`userId`, `tokenHash`
`@unique`, `expiresAt`, `usedAt`, `createdAt`), deliberadamente sin guardar
nunca el token crudo — solo su hash SHA-256 (`src/lib/passwordReset.ts`,
`generateRawResetToken`/`hashResetToken`), mismo principio que las
contraseñas: un acceso a la base de datos no permite reconstruir links de
reseteo válidos. Token expira en 60 minutos y es de un solo uso; un cooldown
de 2 minutos por usuario evita crear un segundo token si ya hay uno vigente
sin usar (protección liviana contra reventar el botón de submit, no
rate-limiting real). `src/lib/email.ts` envuelve el SDK de Resend con
`sendPasswordResetEmail` — si falla el envío (ej. sin `RESEND_API_KEY`
configurada), solo lo loguea y sigue, nunca revienta la respuesta al
usuario. Bug real detectado y corregido durante la implementación:
`new Resend(apiKey)` tira si la key está vacía, así que el cliente se
instancia adentro del `try` de `sendPasswordResetEmail` en vez de a nivel de
módulo — si no, importar `email.ts` rompía con un 500 la carga de
`/forgot-password` (y cualquier página que importe ese `actions.ts`) apenas
alguien la visitaba, incluso sin llegar a enviar el formulario.

Dos páginas públicas nuevas: `/forgot-password` (pide el email, respuesta
**siempre igual** exista o no la cuenta — protección anti-enumeración, igual
cuidado que ya tiene el signup) y `/reset-password?token=...` (valida el
token por su hash — no existe, ya usado, o vencido dan el mismo mensaje
genérico sin revelar cuál — y al resetear invalida además cualquier OTRO
token sin usar de ese mismo usuario). `/login` suma el link "¿Olvidaste tu
contraseña?" y el mensaje de éxito tras un reset.

Cambio de contraseña logueado: nueva página `/dashboard/[tenantSlug]/account`
(`requireDashboardAccess`, cualquier usuario con acceso al dashboard, no
solo OWNER/ADMIN — respeta el hard-lock de `PAST_DUE`/`CANCELLED` igual que
el resto del dashboard sin código adicional), exige la contraseña actual
antes de aceptar la nueva, y de paso invalida cualquier
`PasswordResetToken` pendiente de ese usuario. Link "Mi cuenta" agregado al
nav del dashboard, visible para cualquiera con acceso.

Complemento agregado sin que fuera parte del pedido original de "olvidé mi
contraseña" self-service, por costo marginal bajo (reutiliza casi 1:1 el
patrón ya existente): reseteo asistido por OWNER/ADMIN desde Equipo
(`resetTeamMemberPasswordAction` en `team/actions.ts`), para el caso de un
teammate con el email mal cargado o inaccesible. Reutiliza tal cual
`generateTemporaryPassword()` y la cookie httpOnly `newUserTempPassword`
(mismo nombre, mismo `maxAge: 60`) que ya usa `createTeamMemberAction`, y la
misma regla anti-escalación ya existente (un ADMIN no puede resetear la
contraseña de un usuario con rol OWNER en el tenant).

Verificado en vivo (tenant/usuarios QA descartables por HTTP contra la base
real, sin tocar `owner@demo.com`, borrados al terminar): anti-enumeración
(email inexistente y real dan la misma respuesta, solo el real crea un
token); cooldown de 2 minutos (un segundo pedido inmediato no crea un
segundo token); reset completo (token válido cambia `passwordHash`, marca
`usedAt`, reusar el mismo link es rechazado, un token forzado a expirado
también es rechazado, y el login con la contraseña nueva funciona); cambio
de contraseña logueado (contraseña actual incorrecta bloquea sin tocar
nada; correcta + nueva válida actualiza e invalida cualquier
`PasswordResetToken` pendiente); reseteo asistido (un ADMIN no puede
resetear a un OWNER, mismo mensaje que la regla de escalación existente; un
OWNER sí puede resetear a un STAFF y la contraseña temporal mostrada una
sola vez sirve para loguearse). Los 62 tests existentes siguen pasando.

Fuera de esta fase / pendiente real: no hay `RESEND_API_KEY` configurada
todavía, así que la entrega real de un email nunca se probó contra Resend
en serio (falla silenciosamente, como está diseñado) — falta crear la
cuenta de Resend y cargar la key en `.env` para cerrar ese punto. Cambiar la
contraseña NO cierra sesiones JWT activas en otros dispositivos (Auth.js con
`session: { strategy: "jwt" }` no tiene un store de sesiones para revocar
tokens ya emitidos sin mantener una blacklist aparte) — limitación conocida,
no resuelta en esta fase. Tampoco hay rate-limiting real (CAPTCHA/IP) más
allá del cooldown por usuario.

Vínculo Profesional↔Usuario (login propio para un profesional) ✅ hecho y
verificado en vivo — siguiendo `prompt-vinculo-profesional-usuario.md`.
Hallazgo al planear esta fase: `Professional.userId` (`String? @unique`) y
`User.professionalProfile` ya existían en el schema desde scaffolding muy
temprano, nunca usados — cero migraciones nuevas, toda la fase es capa de
aplicación. El enum `Role` ya traía el comentario
`PROFESSIONAL // atiende citas, ve solo su agenda`, pero eso NO se
implementó acá: alcance elegido explícitamente (recomendado para ir rápido,
mismo patrón de fases delgadas del proyecto) fue **solo el vínculo de
identidad + la invitación** — un profesional con login propio ve exactamente
lo mismo que hoy ve un STAFF (la agenda completa de su sede, todos los
clientes). Restringir la agenda/clientes a "solo lo mío" para un login
PROFESSIONAL queda fuera, sin empezar, como fase aparte a futuro.

Tres funciones nuevas en `professionals/actions.ts` (sin tocar las
existentes ni ningún archivo de Equipo — se duplicó a propósito la regex de
email y `generateTemporaryPassword()` en vez de importarlas de
`team/actions.ts`, para no crear una dependencia entre fases):
`inviteProfessionalAsUserAction` (crea un `User` nuevo + un
`StaffLocationRole(PROFESSIONAL)` por cada sede que el profesional ya tenga
asignada — nunca un rol elegido a mano, siempre `PROFESSIONAL` fijo — y
vincula `Professional.userId`, reusando tal cual la cookie httpOnly
`newUserTempPassword` que ya usa Equipo para mostrar la contraseña temporal
una sola vez); `linkExistingUserToProfessionalAction` (vincula a un usuario
del equipo que ya existe, sumando `StaffLocationRole(PROFESSIONAL)` SOLO en
las sedes donde ese usuario todavía no tenga ningún rol — nunca pisa un rol
existente, pensado explícitamente para el caso de un OWNER de un tenant
`INDIVIDUAL` vinculándose a sí mismo como su propio y único profesional, sin
perder su rol `OWNER`); `unlinkProfessionalUserAction` (solo borra el
vínculo de identidad, no toca el `User` ni sus roles — si hace falta revocar
acceso también, se hace aparte desde Equipo). Las tres bloquean si el
profesional no tiene ninguna sede asignada todavía (sin eso, el usuario
quedaría sin ningún acceso y no podría ni loguearse) y si ya tiene un
usuario vinculado. Nueva sección "Acceso al dashboard" en
`professionals/[professionalId]/page.tsx` con los tres estados (sin sede
asignada / invitar o vincular / ya vinculado con opción de desvincular) —
no se tocó `professionals/new/page.tsx` ni `createProfessionalAction`/
`updateProfessionalAction`.

Decisión deliberada, documentada para no confundirla con un olvido: el
acceso otorgado (`StaffLocationRole`) NO se resincroniza automáticamente si
después cambian las sedes asignadas al profesional vía el checklist ya
existente — eso se ajusta a mano desde Equipo. Evita lógica de
sincronización bidireccional frágil y el riesgo de pisar accesos otorgados
por otro lado.

Verificado en vivo (tenant QA descartable, plan `INDIVIDUAL`, borrado al
terminar): profesional sin sede asignada muestra el aviso en vez del
formulario; asignada la sede, invitar como usuario nuevo crea exactamente un
`StaffLocationRole(PROFESSIONAL)` por sede asignada y la contraseña temporal
sirve para loguearse y ver la agenda de esa sede; invitar con un email ya
usado por otro usuario del tenant se bloquea sugiriendo vincular en vez de
crear, sin tocar nada; vincular a un usuario existente del equipo funciona y
ese usuario deja de aparecer como candidato en el `<select>` de otro
profesional distinto; caso clave — vincular al propio `OWNER` como
profesional de sí mismo conserva su rol `OWNER` en su sede, sin degradarlo a
`PROFESSIONAL`; "Quitar vínculo" deja `Professional.userId` en null sin
tocar el `User` ni sus roles, y permite volver a invitar/vincular después.
Los 62 tests existentes siguen pasando y el resto del dashboard (clientes,
equipo, sedes, profesionales, el 307 esperado de Inventario por gating de
plan en INDIVIDUAL) responde igual que antes.

Fuera de esta fase: filtrar la agenda/clientes por profesional para que un
login `PROFESSIONAL` vea "solo lo mío" (la fase más grande que se descartó
explícitamente por ahora), resincronización automática de accesos al
cambiar sedes, cualquier UI para gestionar `Service` en sí (sigue sin
existir, fuera del alcance de esta fase también).

Gestión de servicios ✅ hecho y verificado en vivo — siguiendo
`prompt-gestion-servicios.md`. `model Service` ya tenía todos los campos
necesarios (`name`, `durationMinutes`, `price`, `active`) desde el
scaffolding inicial — cero migraciones, toda la fase es capa de aplicación,
calcada casi 1:1 del patrón ya usado en Profesionales/Sedes: lista +
`new/` + `[serviceId]/`, guard nuevo `requireServicesManageAccess` en
`auth-guards.ts` (OWNER/ADMIN, sin gating de plan — catálogo core de todos
los planes), y nunca borrado real, solo `active` (mismo criterio que
Profesionales/Sedes/Inventario).

Nota de diseño que ya traía el modelo y esta fase no tocó: `Service.price`
no tiene moneda propia — sigue siendo el número canónico que
`src/app/(public)/[tenantSlug]/actions.ts` interpreta como USD para Stripe y
convierte con el tipo de cambio mockeado (`MOCK_USD_TO_COP_RATE`) para
Wompi/COP. El formulario de servicio no agrega selector de moneda.

Como el checklist de servicios en `professionals/new` y
`professionals/[professionalId]` y el listado de la agenda pública de
reservas ya filtraban por `active: true` desde antes de esta fase, un
servicio nuevo aparece solo en esos lugares sin haber tocado esos archivos
— verificado en vivo, no solo asumido. Verificado en vivo (tenant QA
descartable, plan BASICO, borrado al terminar): servicio nuevo visible en
la lista, en el checklist de un profesional nuevo, y en el booking público;
editado (duración y precio) se refleja en los tres lugares; desactivado
desaparece del checklist y del booking público pero la fila
`ProfessionalService` de un profesional que ya lo tenía asignado queda
intacta en la base; un usuario STAFF recibe 404 al intentar entrar a
`/services`. Los 62 tests existentes siguen pasando y el resto del
dashboard no cambió de comportamiento.

Fuera de esta fase: vínculo servicio↔insumo de inventario con descuento
automático de stock, selector de moneda por servicio, cualquier cambio a la
lógica de checkout de Stripe/Wompi.

Constructor de campos personalizados por tenant (ficha de cliente) ✅ hecho
y verificado en vivo — siguiendo `prompt-constructor-campos-clientes.md`.
Nuevo modelo `TenantClientField` (`key`/`label`/`type`
`CustomClientFieldType`/`options` Json/`order`/`active`), aditivo a la
plantilla fija por vertical que ya existía (`CLIENT_FIELD_TEMPLATES` en
`src/lib/clientFieldTemplates.ts`) — nunca la reemplaza, oculta ni
reordena. Decisión de negocio: sin gating de plan, disponible en los 4
planes por igual, porque la ficha configurable por vertical ya está
listada como incluida desde INDIVIDUAL y este constructor es una extensión
de esa misma promesa, no un módulo nuevo.

Integración limpia: `getEffectiveClientFieldTemplate(tenantId, vertical)`
(nueva, async) devuelve `[...plantilla fija, ...personalizados activos del
tenant]`, y los 4 call sites que antes llamaban a `getClientFieldTemplate`
(síncrona) — `clients/new/page.tsx`, `clients/[clientId]/page.tsx`, y dos
veces en `clients/actions.ts` — pasaron a usar la versión nueva con
`await`. `ClientForm.tsx` (renderiza cualquier `ClientFieldDefinition[]`) y
`buildCustomFields` (whitelist de keys) no se tocaron — ya eran
suficientemente genéricos. Gestión en `client-fields/` (lista + `new/` +
`[fieldId]/`) detrás de `requireClientFieldsManageAccess` (OWNER/ADMIN, sin
gating de plan). El `key` se autogenera del `label` (normalización NFD +
minúsculas + `_`, mismo patrón que el `slugify` de signup pero con guión
bajo en vez de guión, por ser una key de JSON) y queda fijo para siempre —
igual que el `type`, que tampoco es editable una vez creado (evita dejar
datos guardados bajo un tipo que ya no coincide con el form; si hace falta
otro tipo, se desactiva y se crea un campo nuevo). Nunca hay borrado real,
solo `active` — desactivar saca el campo de la ficha (nueva y edición) sin
tocar los datos ya guardados en `Client.customFields` de clientes
existentes.

Bug real detectado y corregido durante la implementación: el proyecto no
tenía ningún `vitest.config.ts`, así que Vitest no resolvía el alias
`@/*` (sí lo resuelve `tsconfig.json`, usado por Next.js). El hueco estaba
latente porque hasta ahora ningún módulo con test importaba nada por ese
alias; al agregarle `import { prisma } from "@/lib/prisma"` a
`clientFieldTemplates.ts` (que sí tiene test), rompió
`clientFieldTemplates.test.ts`. Se arregló agregando `vitest.config.ts` con
el mismo alias que ya declara `tsconfig.json` — sin dependencias nuevas, y
deja resuelto el hueco para cualquier módulo testeado que use `@/` de acá
en adelante.

Nota honesta sobre el propio prompt: el ejemplo de colisión de key sugerido
en la verificación ("Diagnostico Cie10" contra la key fija
`diagnosticoCie10` en PSICOLOGIA) no podía colisionar nunca, porque el
algoritmo de generación de `key` siempre produce snake_case en minúsculas
(`diagnostico_cie10`) mientras las keys fijas son camelCase
(`diagnosticoCie10`) — son distintas como key de JSON. Se detectó al
verificar en vivo (se creó sin bloquear, correctamente, como corresponde
porque no era una colisión real) y se re-probó con un caso que sí
colisiona de verdad: `antecedentes` (key fija de una sola palabra en
PSICOLOGIA, que al generarse en minúsculas coincide igual) contra un campo
nuevo llamado "Antecedentes" — ahí sí bloqueó con el mensaje esperado.

Verificado en vivo (tenants QA descartables, borrados al terminar): campo
de texto nuevo aparece en el form de cliente después de los fijos de la
vertical; campo `SELECT` con 3 opciones se renderiza correctamente; un
cliente guardado con datos en un campo fijo y dos personalizados tiene
todas las keys en el mismo `Client.customFields`; colisión de key real
bloqueada sin crear nada; desactivar un campo lo saca de ambos formularios
pero el valor ya guardado en un cliente existente sigue en la base, y
reactivarlo lo trae de vuelta precargado; un usuario STAFF recibe 404 en
`/client-fields`; los 62 tests existentes pasan; un tenant sin ningún campo
personalizado se ve exactamente igual que antes de esta fase.

Fuera de esta fase: ocultar/reordenar los campos fijos de la plantilla de
vertical (sigue siendo un "constructor aditivo", no un reemplazo completo),
editar el `type` de un campo ya creado, reordenamiento manual (drag and
drop) de campos personalizados, atar campos personalizados a una vertical
específica (son del tenant entero).

Exportar reportes (CSV, PDF, gráficos) ✅ hecho y verificado por revisión de
código independiente — siguiendo `prompt-exportar-reportes.md`. Refactor base
en `src/lib/reports.ts`: la lógica que antes vivía inline en
`reports/page.tsx` (los tres `Promise.all` + armado de
`statusCountsByStatus`/`revenueRows`/`commissionRows`) se extrajo tal cual,
sin cambiar el cálculo, a `computeReportData(tenantId, professionals, from,
to)` — ahora es la única fuente de verdad que llaman por igual la página, el
export CSV y el export PDF, así los tres nunca pueden mostrar números
distintos entre sí. Confirmado leyendo el archivo que preserva intacta la
regla de nunca sumar montos de `Payment` de distinta moneda/proveedor
(Stripe usd y Wompi COP siempre filas separadas) y que la comisión sigue
calculándose sobre `Service.price` de citas `COMPLETED`, nunca sobre
`Payment.amount`.

Gráficos: `src/app/dashboard/[tenantSlug]/reports/ReportsCharts.tsx` (client
component nuevo, mismo patrón de aislamiento que `WeeklyAgenda.tsx` — recibe
los datos ya calculados por props, sin acceso a la base), con `recharts`
(dependencia nueva) — tres barras (citas por estado, ingresos por
proveedor+moneda, comisión por profesional), reutilizando la paleta de marca
del proyecto en vez de sumar una paleta nueva, con label directo en cada
barra (la identidad de cada barra no depende solo del color) y color fijo
por proveedor (Stripe/Wompi mantienen su color entre renders y rangos de
fecha). Confirmado que el gráfico de ingresos nunca combina Stripe y Wompi
en una sola barra — cada fila de `revenueRows` ya viene separada por
proveedor+moneda desde `computeReportData`, el componente solo arma la
etiqueta del eje X (`"Stripe (USD)"` / `"Wompi (COP)"`). Insertado en
`reports/page.tsx` arriba de las tres secciones de tablas existentes, que se
mantienen sin quitar.

Export CSV: `src/app/dashboard/[tenantSlug]/reports/export/csv/route.ts`,
Route Handler normal de App Router, detrás del mismo
`requireReportsAccess(tenantSlug)` que ya usa la página (hereda el gating de
plan y el rol OWNER/ADMIN sin código nuevo). Parámetro `section` (`citas` |
`ingresos` | `comisiones`) más `from`/`to`. Helper nuevo sin dependencias en
`src/lib/csv.ts` (`escapeCsvField`, `buildCsvRow`, estilo RFC 4180, filas
unidas con `\r\n`) — confirmado leyendo el archivo que coincide exactamente
con el spec.

Export PDF — la única desviación arquitectónica real de esta fase, documentada
acá con detalle porque es una excepción a la estructura de puro App Router
que el resto del proyecto sigue: **vive en Pages Router**
(`src/pages/api/reports/[tenantSlug]/pdf.tsx`), no en
`src/app/.../export/pdf/route.ts` como pedía el prompt original. Motivo:
`@react-pdf/renderer` (elegido para generar el PDF de verdad en el servidor,
JS puro sin navegador headless, corre bien en funciones serverless de
Vercel) usa su propio reconciler de React con su propio `require("react")`
interno; en Next 15, todo lo que cuelga de `src/app/` —incluidos los Route
Handlers— se compila bajo la condición de módulo `"react-server"`, que le da
al JSX de la app una copia de React distinta a la que ve el reconciler de
react-pdf, disparando "Minified React error #31" (objeto no válido como
hijo de React) apenas se llama a `renderToBuffer`. Confirmado con una prueba
mínima aislada (`<Document><Page><Text>`, sin ningún dato de negocio) que
falla igual bajo App Router y funciona sin cambios bajo Pages Router, que no
pasa por ese grafo de módulos de RSC. `@react-pdf/renderer` quedó en
`^3.4.5` (downgrade desde 4.5.1 durante la investigación — v4 apunta a React
19; no era la causa raíz del error pero se mantuvo la versión más compatible
con el React 18 del proyecto).

Esa mudanza a Pages Router obligó a reimplementar a mano, dentro de
`pdf.tsx`, la misma cadena de guards de `requireReportsAccess`/
`requireDashboardAccess` (`src/lib/auth-guards.ts`) con respuestas HTTP
planas en vez de `redirect()`/`notFound()` de `next/navigation` (exclusivos
de App Router): token ausente → `res.redirect(302, "/login")`; tenant no
encontrado o de otro usuario → `res.status(404).end()`; `PAST_DUE`/
`CANCELLED` → redirect a `account-locked`; sin rol en ninguna sede del
tenant → 404; plan sin el módulo `reports` → redirect a `plan-required`; sin
rol OWNER/ADMIN → 404. La sesión se lee con `getToken` de `next-auth/jwt`
(agnóstico de router) en vez de `auth(req, res)` de `src/lib/auth.ts` (ese
overload importa `next/server` internamente y tira `ERR_MODULE_NOT_FOUND`
en contexto de Pages Router) — `getToken` expone los mismos claims
(`userId`/`tenantId`/`locationRoles`) que ya carga el callback `jwt` de
`auth.ts`. **Verificado por revisión de código independiente, línea por
línea contra `auth-guards.ts` real**: el orden y las condiciones de la
cadena reimplementada coinciden exactamente con el guard original, sin
ningún check faltante ni reordenado que abra un hueco de seguridad;
confirmado además que no existe ningún `middleware.ts` a nivel de proyecto
que esta ruta nueva pudiera estar esquivando. `src/lib/auth.ts` solo cambió
en un comentario explicativo sobre un cast de tipo ya existente
(`user.id as string`) — no es un cambio de comportamiento, expuesto por un
shift transitivo de versión de `next-auth`/`@auth/core` al instalar las
dependencias nuevas.

Botones de descarga en `reports/page.tsx`: "Descargar PDF" arriba de todo
(apunta a `/api/reports/${tenantSlug}/pdf?from=...&to=...`, con un
comentario en el JSX explicando por qué esa ruta vive en Pages Router y no
junto al resto de `/dashboard/...`), y un "Descargar CSV" junto al `<h2>` de
cada una de las tres secciones. Confirmado leyendo el archivo que el
refactor de `computeReportData` no cambió ningún número ni marcado ya
renderizado — mismo HTML de las tres secciones de tablas, mismo formulario
inline de edición de comisión (`updateProfessionalCommissionRateAction`, no
tocado).

Fuera de esta fase: gráficos dentro del PDF (deliberadamente no —
requeriría rasterizar con un navegador headless, justo lo que se evitó al
elegir `@react-pdf/renderer`), cualquier gating de plan nuevo (export y
gráficos heredan el mismo `requireReportsAccess` que ya tenía toda la
página), exportar a otros formatos (Excel, etc.).

Vínculo servicio↔insumo con descuento automático de stock ✅ hecho y
verificado en vivo — siguiendo `prompt-vinculo-servicio-insumo.md`. Antes de
escribir el spec se debatió explícitamente, con tres agentes especializados
argumentando en paralelo y sin verse entre sí (integridad de datos de
inventario, arquitectura de software a largo plazo, operación real de un
consultorio chico), qué debía pasar si al completar una cita algún insumo
vinculado no tiene stock suficiente en esa sede. Perdieron dos posturas:
bloquear la cita hasta reponer stock (rompería un principio ya establecido en
el proyecto — `Appointment.status` es fuente de verdad independiente de
sistemas auxiliares, igual que la comisión ya se calcula sobre citas
`COMPLETED` sin importar el estado del pago, "para que funcione igual en
negocios que cobran en efectivo"); y topar el descuento en 0 sin bajar de ahí
(la peor opción real: esconde silenciosamente que hubo más consumo del
registrado, contaminando cualquier reporte de consumo futuro sin que nadie lo
note). Ganó: la cita SIEMPRE se completa, sin importar el stock; el stock
puede quedar en negativo como señal honesta y visible de un faltante real.

Modelo nuevo `ServiceInventoryItem` (tenant-wide, como `Service` —
`serviceId`+`itemId` como PK compuesta, `quantityPerUse` siempre positivo).
`InventoryMovement` ganó `appointmentId` opcional (`onDelete: SetNull`,
mismo patrón que `clientId`/`appointmentId` en `NotificationQueue` de la fase
de CRM predictivo): un movimiento manual (`recordInventoryMovementAction`)
siempre lo tiene `null`; uno automático de esta fase siempre lo trae seteado
— así se distinguen sin ambigüedad. Migración puramente aditiva, confirmada
leyendo el SQL generado.

Lógica de descuento en `src/lib/inventory.ts`
(`deductInventoryForCompletedAppointment`, pensada para correr dentro de una
transacción ya abierta por quien la llama): por cada `ServiceInventoryItem`
del servicio, hace un `upsert` de `InventoryStock` con `decrement` atómico
(sin leer el stock actual primero — a diferencia de
`recordInventoryMovementAction`, acá nunca se bloquea, así que el decrement
atómico alcanza y es más seguro ante concurrencia), creando la fila en
negativo directamente si no existía todavía (caso de insumo vinculado antes
de cargar stock inicial en esa sede — no es un error, es configuración
incompleta), y crea el `InventoryMovement` (`type: "OUT"`, `quantity`
siempre positivo — el signo lo sigue dando `type`, no el número — con
`appointmentId` y `createdByUserId` del usuario que completó la cita).
Enganchado en `updateAppointmentStatusAction`
(`src/app/dashboard/[tenantSlug]/actions.ts`): el update de la cita y la
deducción condicional quedaron en una sola `prisma.$transaction` (por
atomicidad, no por bloqueo — la condición de negocio en sí nunca impide
completar la cita). La deducción solo corre si `nextStatus === "COMPLETED"`
Y el plan del tenant incluye el módulo `"inventory"` — si no lo incluye, ni
se intenta, mismo criterio que ya sigue `detect-inactive-clients` con el
módulo `"reengagement"` (un tenant sin el módulo no genera movimientos,
aunque tenga `ServiceInventoryItem` configurados de una fase con un plan
superior — no se borran los vínculos, solo no se aplican). Como `COMPLETED`
es un estado terminal sin transición de salida
(`ALLOWED_STATUS_TRANSITIONS.COMPLETED = []`), una cita entra a `COMPLETED`
como máximo una vez en su vida, así que no hace falta ningún guard de
idempotencia para el descuento.

Checklist de insumos en `services/[serviceId]/page.tsx` (visible solo si
`planIncludesModule(tenant.plan, "inventory")`, sin redirect si no — es solo
una sección oculta dentro de una página que carga bien igual) + nueva
`updateServiceInventoryItemsAction` en `services/actions.ts`, gateada por
`requireServicesManageAccess` MÁS un chequeo explícito del módulo (si no lo
incluye, redirige a `plan-required`, defensa en profundidad aunque la UI ya
la oculta). Set-replace transaccional de `ServiceInventoryItem` (mismo
patrón que `applyProfessionalServicesUpdate`), con cantidad por uso validada
como entero >= 1 para cada ítem marcado — si falla, bloquea el guardado
completo sin persistir nada parcial (confirmado que el `redirect()` corta la
ejecución antes de llegar a la transacción).

En `inventory/[itemId]/page.tsx`: badge "Stock negativo" distinto de "Stock
bajo (umbral: N)" (nunca se muestran los dos a la vez — si el stock es
negativo ya no hace falta aclarar que también está bajo el umbral), y en la
lista de "Últimos movimientos" un movimiento con `appointmentId` muestra la
etiqueta "Automático — cita completada" en vez de su `note`, distinguiéndolo
a simple vista de uno manual.

Verificado en vivo con la acción real vía HTTP (replicando el protocolo
`Next-Action` de React Server Components con curl contra el id de la Server
Action compilada, no un atajo directo a la base): insumo con stock
suficiente (10, consume 2) bajó a 8 con su movimiento automático completo;
insumo con stock insuficiente (1, consume 5) en la misma cita completó la
cita igual, sin bloqueo, dejando el stock en -4; insumo sin ninguna fila de
`InventoryStock` previa creó la fila en -1 al completar, sin romper; un
servicio sin insumos vinculados se completó igual, cero movimientos nuevos;
un `OUT` manual que supera el stock se sigue rechazando exactamente igual
que siempre (no se tocó esa regla); un tenant en BASICO (sin módulo
`inventory`) con un `ServiceInventoryItem` ya configurado de antes no mostró
la sección "Insumos" al editar el servicio, y completar esa cita no generó
ningún movimiento ni tocó el stock. Confirmados visualmente los badges
"Stock negativo"/"Stock bajo" y la etiqueta de movimiento automático. El
checklist de insumos también se probó por la UI real (no solo por script),
vinculando un insumo a un servicio y confirmando el `ServiceInventoryItem`
creado en la base con la cantidad correcta. Los 62 tests existentes siguen
pasando.

Fuera de esta fase: ningún campo de costo/moneda en `InventoryItem` ni
`ServiceInventoryItem`, desvinculación automática de un `ServiceInventoryItem`
cuando el `InventoryItem` asociado se desactiva (se puede seguir viendo y
gestionando a mano, igual que el resto del proyecto no auto-limpia vínculos
al desactivar algo), cualquier reporte de consumo de insumos.

Al pedirle trabajo a Claude Code, referencia la fase en la que estás para que
no se adelante a construir cosas de fases posteriores sin necesidad.

## Comandos útiles

```bash
npm install
cp .env.example .env        # y completar DATABASE_URL, etc.
docker compose up -d        # levanta Postgres local
npm run db:migrate          # crea las tablas a partir de prisma/schema.prisma
npm run db:seed             # carga datos de ejemplo (tenant, sede, servicio, cliente demo)
npm run dev                 # http://localhost:3000
```

## Qué falta por decidir (pendiente antes de fase 1 completa)

- ~~Proveedor de auth definitivo~~ → resuelto: Auth.js v5 + Credentials +
  `@auth/prisma-adapter` (ver sección Stack).
- ~~Proveedor de WhatsApp~~ → resuelto: API oficial de Meta directa, sin
  capa intermedia (ver sección Stack y Fase 1). System User, token
  permanente y envío real ya verificados (sesión de Cowork, ver sección
  dedicada más abajo). Pendiente real: aprobación de las plantillas
  "recordatorio_cita"/"seguimiento_recompra", número de WhatsApp Business de
  producción y verificación de negocio en Meta Business Suite — trámites
  manuales, no de código.
- ~~Modelo de precios~~ → resuelto: suscripción pura por sede/usuarios
  (planes fijos mensuales/anuales, sin comisión sobre citas ni pagos
  procesados), igual que AgendaPro. Se descartó el híbrido tipo Fresha
  porque su comisión (20%, mínimo 6 USD) es específicamente por clientes
  nuevos captados vía el marketplace propio de Fresha, y Plataforma Agenda
  no tiene ni tiene planeado un marketplace así (la agenda pública es por
  tenant, no un directorio que le mande clientes nuevos a los negocios). Un
  costo variable sobre ingresos además contradice el diferenciador #1
  ("precio transparente") y el nicho (clínicas chicas) prefiere costo fijo
  predecible.
- ~~Tiers concretos (precio y límites por plan)~~ → resuelto, mapeado a los
  4 valores que ya existen en el enum `Plan` del schema (hoy es solo un
  campo de datos — no hay feature-gating implementado en ninguna fase
  todavía, así que definir esto no dispara ninguna migración ni cambio de
  código por sí solo):
  - `INDIVIDUAL` — 19 USD/mes. 1 profesional activo, 1 sede. Agenda
    pública+interna, recordatorios WhatsApp sin límite duro visible, pagos
    Stripe/Wompi, ficha configurable por vertical.
  - `BASICO` — 35 USD/mes. Hasta 3 profesionales activos, 1 sede. Todo lo
    de INDIVIDUAL + Reportes y comisiones.
  - `PREMIUM` — 59 USD/mes. Hasta 8 profesionales activos, hasta 3 sedes.
    Todo lo de BASICO + CRM predictivo de recompra + Inventario.
  - `PRO` — 99 USD/mes. Profesionales y sedes ilimitados. Todo + soporte
    prioritario.
  Los límites son por **profesionales activos** (`Professional.active`),
  no por usuarios/logins `StaffLocationRole` — un STAFF de recepción con
  acceso no debe contar contra el tope, porque la métrica de capacidad del
  negocio son los profesionales que atienden, no las cuentas con login.
  Precios ancla en AgendaPro (19/29/59 USD/mes) y en el valor agregado de
  multi-sede/CRM predictivo/inventario que AgendaPro no ofrece igual de
  incluido. Nota: estos montos y topes son una propuesta razonada, no
  están validados contra costos reales (WhatsApp Cloud API, Stripe/Wompi,
  infraestructura) ni contra investigación de disposición a pagar del
  nicho — ajustar si la data real lo pide más adelante. Implementar el
  feature-gating por plan (bloquear Inventario/CRM predictivo/Reportes
  según `Tenant.plan`, hacer cumplir los topes de profesionales/sedes, y
  la facturación en sí vía Stripe/Wompi suscripciones) queda fuera de
  cualquier fase hecha hasta ahora — es trabajo de código pendiente,
  todavía sin fase asignada.

## Integración de WhatsApp Business (Meta) — sesión de Cowork (31 jul 2026)

Este trabajo se hizo en una conversación de Cowork (no en Claude Code/VS
Code), de ahí que no estuviera reflejado arriba hasta ahora. Ningún cambio
de código — todo trámite/configuración del lado de Meta.

- **System User de Meta Business**: "PlataformaAgenda API" (ID
  `61592688632182`, rol Admin), con activos asignados: la app "Plataforma
  Agenda" (permiso Desarrollar app) y la "Test WhatsApp Business Account"
  (permisos de plantillas y números de teléfono).
- **Token de acceso permanente** (nunca expira), scopes
  `whatsapp_business_management` y `whatsapp_business_messaging`, cargado en
  `.env` como `WHATSAPP_CLOUD_API_TOKEN`. Nota: el primer token generado se
  perdió (se sobrescribió del portapapeles antes de guardarlo) — sigue
  técnicamente activo del lado de Meta, no revocado. Se generó un segundo
  token permanente con los mismos scopes, que es el que quedó cargado. Para
  limpiar el primero: Meta Business Suite → Usuarios del sistema →
  "PlataformaAgenda API" → Revocar tokens.
- **Phone Number ID de prueba**: `1233870256475019` (número de prueba de
  Meta, +1 555 198-6649), cargado como `WHATSAPP_PHONE_NUMBER_ID`. WhatsApp
  Business Account ID: `1780554303114522`.
- **Dos plantillas creadas y enviadas a revisión** (estado al cierre de la
  sesión: "En revisión"):
  - `recordatorio_cita` — categoría Utilidad, `es_MX`, 3 variables
    posicionales (nombre, servicio, fecha/hora). Coincide exactamente con
    `buildReminderTemplatePayload` en `src/lib/whatsapp.ts` — no hace falta
    ningún cambio de código cuando se apruebe.
  - `seguimiento_recompra` — categoría Marketing (implica costo más alto y
    revisión más estricta que Utilidad), `es_MX`, 2 variables (nombre,
    nombre del negocio). Coincide con `buildFollowUpTemplatePayload`.
- **Prueba de envío real exitosa**: vía el panel de pruebas de Meta for
  Developers, usando una plantilla pre-aprobada de Meta ("Confirmación del
  pedido", la única disponible mientras las propias están en revisión), se
  envió un mensaje al número verificado +57 312 368 1984. El webhook de
  prueba confirmó `"status": "delivered"` — valida que el token permanente y
  el Phone Number ID cargados en `.env` funcionan de punta a punta contra la
  API real de Meta.

**Qué falta para producción** (ninguno es trabajo de código):

1. Aprobación de Meta de `recordatorio_cita` y `seguimiento_recompra`
   (normalmente horas, a veces 24-48h).
2. Número de WhatsApp Business real (no el de prueba) — Jonta indicó que por
   ahora no puede avanzar este paso.
3. Verificación de negocio en Meta Business Suite (1 a 30 días).
4. Una vez exista el número de producción, reasignar el token permanente (o
   generar uno nuevo) con acceso al WABA real, no solo al de prueba.
5. Confirmar en `.env` de producción los mismos valores de
   `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` (las variables de
   nombre/idioma de plantilla ya están correctas: `recordatorio_cita`/`es_MX`
   y `seguimiento_recompra`/`es_MX`).

Ver también `guia-aprobacion-whatsapp-business-meta.md` en la raíz del repo
para el paso a paso completo del trámite.
