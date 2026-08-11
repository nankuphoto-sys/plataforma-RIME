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
   Fuera de esta fase (en ese momento): exportar a CSV/PDF, gráficos (ambos
   resueltos después, ver "Exportar reportes" más abajo), comisión por
   servicio individual, tracking de "comisión pagada" (ambos resueltos
   después, ver "Costo por insumo, comisión por servicio, reporte de
   consumo, alertas de stock bajo por WhatsApp" más abajo).
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
   Fuera de esta fase (en ese momento): vínculo servicio↔insumo y descuento
   automático por cita (resuelto después, ver "Vínculo servicio↔insumo con
   descuento automático de stock"), alertas por WhatsApp, costos por insumo,
   reportes de consumo (los tres resueltos después, ver "Costo por insumo,
   comisión por servicio, reporte de consumo, alertas de stock bajo por
   WhatsApp" más abajo). Categorías/proveedores y borrado de ítems o
   movimientos siguen sin resolver.

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
igual que en las acciones existentes). Dos notas menores resueltas después
(sesión de Cowork): `changeSubscriptionPlanAction` ahora valida
explícitamente `subscription.items.data.length !== 1` antes de asumir cuál
es el item a actualizar (si no, redirige con un error claro en vez de
arriesgarse a que Stripe interprete un `id` faltante como "agregar un ítem
nuevo"), y se agregó `src/lib/subscriptionPlans.test.ts` cubriendo
`getStripePriceId`/`getPlanFromStripePriceId` (mismo patrón de mockear
`process.env` que ya usa `whatsapp.test.ts`).

Fuera de esta fase (en ese momento): Wompi recurrente (ver más abajo, ya
resuelto), cambio de cantidad/prorrateo manual, cualquier otro control de
facturación más allá de elegir el plan destino.

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

Fuera de esta fase (en ese momento): 3DS/3RI, Credential On File, actualizar
tarjeta (solo configurar por primera vez y cancelar), cambio de plan
self-service para tenants en Wompi (ver más abajo, ya resuelto),
reactivación después de `CANCELLED` (ver más abajo, ya resuelto),
notificaciones por WhatsApp/email ante un cobro rechazado.

Cambio de plan self-service para tenants en Wompi ✅ hecho y **verificado en
vivo** (sesión de Cowork, 6 ago 2026 — ver nota al final de esta sección; en
su momento solo se había verificado por tsc/tests). A diferencia de Stripe, Wompi no tiene acá ningún objeto de
"suscripción" que actualizar: `chargeTenantWompiSubscription` siempre
calcula el monto a cobrar leyendo `getWompiPriceInCents(tenant.plan)` en el
momento de cada cobro (no un monto fijado al momento de crear la
suscripción). Por eso `changeWompiSubscriptionPlanAction`
(`billing/actions.ts`) es mucho más simple que su equivalente de Stripe:
solo actualiza `Tenant.plan` directamente — es la única fuente de verdad acá
(no hace falta ningún webhook de por medio, a diferencia de
`changeSubscriptionPlanAction` que espera a `customer.subscription.updated`).

Decisión de producto explícita, documentada en el propio código: el cambio
de ACCESO (feature-gating, que lee `tenant.plan` en cada request) es
inmediato, pero **no hay prorrateo financiero** — el próximo
`wompiNextChargeAt` cobra el monto completo del plan nuevo, sin acreditar ni
cobrar la diferencia de lo que quedaba del ciclo actual. Wompi no ofrece acá
un mecanismo de crédito equivalente a `proration_behavior:
"create_prorations"` de Stripe, y construirlo a mano queda fuera de esta
fase. `billing/page.tsx` unificó la sección "Cambiar de plan" (antes exigía
`tenant.stripeSubscriptionId`) para mostrarse también a tenants de Wompi
(`hasAnySubscription = hasStripeSubscription || hasWompiSubscription`,
mutuamente excluyentes entre sí — ver el error `ya-tenes-stripe` ya
existente), con copy distinto explicando la falta de prorrateo para Wompi,
y el conteo de sedes/profesionales activos (para el aviso de "estás por
encima del límite del plan nuevo") ahora se calcula para cualquiera de los
dos proveedores en vez de solo Stripe.

Verificado originalmente solo por `tsc --noEmit` (limpio) y los 62 tests
existentes, sin tocar ninguno.

**Cierre de ese pendiente (sesión de Cowork, 6 ago 2026, navegador real vía
la extensión de Claude in Chrome contra `npm run dev`)**: como
`changeWompiSubscriptionPlanAction` no llama a la API de Wompi en ningún
punto — solo chequea que `tenant.wompiPaymentSourceId` no sea null y
actualiza `Tenant.plan` directo —, se sembró un tenant QA descartable
(`prisma/qa-wompi-change-plan.ts`) ya "configurado" con Wompi
(`wompiPaymentSourceId` sembrado a mano, sin pasar por la tokenización real
del widget — no hay nada del lado de Wompi que ese source_id falso pudiera
romper, así que no es un atajo que salte ninguna verificación real), plan
BASICO, status ACTIVE, y **2 sedes ya creadas a propósito** para poder
probar en vivo el aviso de "por encima del límite" al bajar a INDIVIDUAL
(que solo permite 1 sede).

Con sesión real de browser (login + clicks, no scripts contra Prisma):
confirmado que Inventario estaba bloqueado en BASICO (`/plan-required?
feature=inventario&requiredPlan=PREMIUM`); clickear "Cambiar a Premium"
actualizó `Plan actual: PREMIUM` de inmediato con el mensaje "sin
prorrateo", y entrar a Inventario en la misma sesión (sin relogin) ya
cargó la página completa — confirmando que el feature-gating lee
`tenant.plan` fresco de la base en cada request, no del JWT. Downgrade a
INDIVIDUAL con las 2 sedes todavía activas se permitió sin bloquear (tal
como está diseñado — nunca se desactiva nada solo), y `/locations` mostró
"2 de 1 sede usadas en tu plan INDIVIDUAL. Alcanzaste el máximo de tu plan
— sube de plan para agregar más." con el link "+ Nueva sede" oculto y
ambas sedes (`Sede QA 1`, `Sede QA 2`) intactas en la tabla — el
enforcement de `hasReachedLocationLimit` reaccionó solo, sin código nuevo
para eso. El aviso "Hoy tenés 2 sedes / 0 profesionales activos, más de lo
que incluye este plan..." se vio correctamente en las tarjetas de
Individual y Básico apenas el plan quedó por encima de ese límite.

No se forzó en vivo el error `mismo-plan` (intentar cambiar al plan que ya
está activo) — la UI ya oculta el botón para el plan actual, y el guard es
una línea idéntica en estructura a la ya verificada en vivo para el
equivalente de Stripe (`error=mismo-plan` sin llamar a Stripe), así que
queda cubierto solo por revisión de código. Tenant QA borrado al terminar
con `prisma/qa-wompi-change-plan-cleanup.ts` (cascade).

Reactivación de cuenta tras `CANCELLED` ✅ hecho y **verificado en vivo**
(sesión de Cowork, 6 ago 2026 — ver nota al final de esta sección; en su
momento solo se había verificado por tsc/revisión de código). Hallazgo
central que faltaba antes de esta fase: el webhook
`customer.subscription.deleted` de Stripe solo actualiza `Tenant.status` a
`CANCELLED`, nunca borra `stripeSubscriptionId` — así que "el tenant tiene
`stripeSubscriptionId`" NO significaba "tiene una suscripción viva". Con la
UI vieja, un tenant CANCELLED de Stripe caía siempre en la rama de
"Gestionar suscripción / actualizar método de pago" (Billing Portal), que no
sirve para resucitar una suscripción ya borrada del lado de Stripe — el
Billing Portal está pensado para gestionar una suscripción activa, no para
crear una nueva. La solución no fue escribir un flujo de reactivación nuevo
para Stripe: fue notar que `createSubscriptionCheckoutAction` (la misma
acción de "Configurar cobro automático" de siempre) ya arma un Checkout
Session nuevo reusando `stripeCustomerId` si existe, y Stripe no tiene
ningún problema en crear una suscripción nueva para un customer que ya tuvo
una anterior cancelada. `billing/page.tsx` ahora calcula
`stripeNeedsReactivation = hasStripeSubscription && tenant.status ===
"CANCELLED"` y, en ese caso, muestra el botón de checkout de siempre con el
label "Reactivar suscripción" en vez de mandar al Billing Portal.

Para Wompi, `wompiPaymentSourceId` tampoco se borra nunca al cancelar (ya
documentado en `cancelWompiSubscriptionAction`), y Wompi no tiene forma de
invalidarlo del lado suyo — sigue siendo cobrable. Por eso
`reactivateWompiSubscriptionAction` (`billing/actions.ts`) es simplemente
reintentar un cobro con `chargeTenantWompiSubscription` (la misma función
compartida que ya usan el primer cobro y el cron mensual), después de
resetear `wompiRetryCount`/`wompiFirstFailedAt` — sin ese reset, un rechazo
en este mismo intento de reactivación encontraría el contador ya en el tope
de la cancelación anterior y recancelaría al toque en vez de darle la
escalera completa de reintentos (+2/+4/+7 días) como a cualquier cobro
normal (ver `handleSubscriptionChargeUpdate` en el webhook de Wompi, no
modificado — ya maneja este caso correctamente por sí solo gracias al
reset). `status` no se toca de forma optimista: sigue en `CANCELLED` hasta
que el webhook confirme el resultado real del cobro.

`billing/page.tsx` unificado: la sección "Cambiar de plan" ahora se oculta
mientras el tenant esté `CANCELLED` (no tiene sentido cambiar de plan sobre
una suscripción muerta — para Stripe directamente fallaría, para Wompi solo
generaría confusión), priorizando el botón de reactivación. La sección de
Wompi muestra "Reactivar suscripción" en vez de "Cancelar suscripción"
cuando el status es `CANCELLED`.

`account-locked/page.tsx` se simplificó para dejar de reimplementar lógica
de Stripe ahí mismo: ya no calcula nada de `stripeCustomerId` ni llama a
`createBillingPortalSessionAction` directamente — ahora es un simple router
que manda a `/billing` (única fuente de verdad para ambos proveedores) si
quien mira la pantalla tiene rol OWNER, o le pide que hable con el OWNER del
tenant si no lo tiene. Este último chequeo de rol es una mejora aparte
detectada de paso: la versión anterior mostraba el botón de Billing Portal
a cualquier usuario del tenant sin importar su rol, y como
`requireBillingAccess` exige OWNER, un STAFF/ADMIN que lo clickeara se
encontraba con un 404 confuso.

Verificado originalmente solo por `tsc --noEmit` (limpio) y revisión de
código, sin tocar ningún test existente.

**Cierre de ese pendiente (sesión de Cowork, 6 ago 2026, navegador real vía
la extensión de Claude in Chrome contra `npm run dev` + Stripe test mode
real + Wompi sandbox real)**: se armaron dos tenants QA descartables desde
cero (`prisma/qa-billing-reactivation.ts`, plan INDIVIDUAL/TRIAL, un OWNER
cada uno) — `qa-billing-stripe` y `qa-billing-wompi` — porque un tenant no
puede tener ambos proveedores configurados a la vez.

Lado Stripe: Checkout real completado con la tarjeta de prueba
4242 4242 4242 4242 (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`
corriendo en paralelo) dejó el tenant en `ACTIVE`. Se descubrió en vivo que
el botón "Cancelar suscripción" del Billing Portal de Stripe solo programa
la cancelación para el fin del período (`cancel_at_period_end: true`), no
dispara `customer.subscription.deleted` de inmediato — para forzar la
cancelación inmediata y poder probar el webhook real hubo que correr
`stripe subscriptions cancel <id>` desde la Stripe CLI. Confirmado en vivo:
el webhook dejó `status: CANCELLED`; entrar a `/dashboard/qa-billing-stripe`
redirigió a `/account-locked` con el mensaje esperado y el botón "Ir a
Facturación"; en `/billing` el botón mostró "Reactivar suscripción" (no
"Gestionar suscripción"); clickearlo abrió un Checkout Session **nuevo**
(no el Billing Portal, que ya no sirve porque la suscripción vieja está
muerta del lado de Stripe); completarlo con la misma tarjeta de prueba dejó
`status: ACTIVE` de nuevo y acceso completo al dashboard restaurado sin
relogin.

Lado Wompi: tokenización real contra el widget hospedado de Wompi
(`https://checkout.wompi.co/widget.js`, modo sandbox) con la misma tarjeta
de prueba 4242 4242 4242 4242 — el primer cobro se disparó real contra la
API de Wompi y se resolvió a `ACTIVE` simulando la entrega del webhook con
`prisma/qa-wompi-webhook-simulate.ts` (mismo patrón ya usado en la
verificación original de "Cobro recurrente vía Wompi": consulta el estado
REAL de la transacción contra la API de Wompi antes de construir el evento,
firmado con el `WOMPI_EVENTS_SECRET` real — no es un atajo que salte la
verificación de firma). Clickear "Cancelar suscripción" dejó `status:
CANCELLED` de inmediato (acción síncrona, sin depender de ningún webhook,
tal como está diseñada) y mostró "Reactivar suscripción" en su lugar;
entrar a `/dashboard/qa-billing-wompi` redirigió a `/account-locked` igual
que con Stripe. Clickear "Reactivar suscripción" mostró "Reactivando..." y
disparó un cobro real nuevo contra Wompi (reseteando `wompiRetryCount`/
`wompiFirstFailedAt` antes, confirmado por lectura de código); resolviendo
ese cobro con el mismo script de simulación de webhook, el tenant volvió a
`ACTIVE` y la Agenda cargó normal (sin redirect a `account-locked`), con el
nav completo (Facturación, Sedes, Reportes, etc.) visible de nuevo.

En ambos casos la sección "Cambiar de plan" desapareció mientras el tenant
estuvo `CANCELLED` y reapareció al volver a `ACTIVE`, tal como está
diseñado. Los dos tenants QA se borraron al terminar con
`prisma/qa-billing-reactivation-cleanup.ts` (cascade sobre `Location`/
`User`/`StaffLocationRole`/`TenantWompiCharge`).

Fuera de esta fase: reactivación automática (sin que el usuario tenga que
apretar un botón), cualquier mensaje proactivo (WhatsApp/email) avisando que
la cuenta fue cancelada o invitando a reactivarla.

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

Decisión deliberada EN ESTA FASE (revertida después — ver "Resincronización
automática de accesos al cambiar sedes" más abajo, ya resuelto): el acceso
otorgado (`StaffLocationRole`) NO se resincroniza automáticamente si después
cambian las sedes asignadas al profesional vía el checklist ya existente —
en ese momento se ajustaba a mano desde Equipo, para evitar lógica de
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
explícitamente por ahora, ver más abajo, ya resuelto), resincronización
automática de accesos al cambiar sedes (en ese momento sin resolver, ver más
abajo, ya resuelto), cualquier UI para gestionar `Service` en sí (sigue sin
existir en ese momento, resuelto después — ver "Gestión de servicios" más
abajo).

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

Fuera de esta fase (en ese momento): campo de costo en `InventoryItem` y
reporte de consumo de insumos (ambos resueltos después, ver "Costo por
insumo, comisión por servicio, reporte de consumo, alertas de stock bajo
por WhatsApp" más abajo). `ServiceInventoryItem` sigue sin campo de
costo/moneda propio (usa el de `InventoryItem`) y la desvinculación
automática al desactivar un `InventoryItem` sigue sin resolver (se puede
seguir viendo y gestionando a mano, igual que el resto del proyecto no
auto-limpia vínculos al desactivar algo).

Al pedirle trabajo a Claude Code, referencia la fase en la que estás para que
no se adelante a construir cosas de fases posteriores sin necesidad.

## Comandos útiles

```bash
npm install
cp .env.example .env        # y completar DATABASE_URL, etc.
docker compose up -d        # levanta Postgres local
npm run db:migrate          # crea las tablas a partir de prisma/schema.prisma
npm run db:seed             # carga datos de ejemplo (tenant, sede, servicio, cliente demo)
npm run db:seed:test-plans  # tenants mínimos en INDIVIDUAL/BASICO/PRO para probar gating (ver sesión 11 ago 2026)
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
  4 valores que ya existen en el enum `Plan` del schema:
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
  nicho — ajustar si la data real lo pide más adelante.
  **Corrección (11 ago 2026): esta nota decía que el feature-gating y la
  facturación estaban pendientes — eso quedó desactualizado y ya no es
  cierto.** Ambos están implementados y verificados de punta a punta, ver
  "Verificación de gating por plan y facturación" más abajo. Antes de
  asumir que algo de esto falta, revisar `src/lib/planLimits.ts` y
  `src/lib/auth-guards.ts` en vez de confiar en esta sección.

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

## Vista "solo lo mío" para login PROFESSIONAL (sesión de Cowork)

✅ hecho y **verificado en vivo** (sesión de Cowork, 2 ago 2026 — ver nota al
final de esta sección). Era el pendiente
más grande documentado tras la fase de vínculo Profesional↔Usuario: hasta
ahora, un login con rol `PROFESSIONAL` veía exactamente lo mismo que un
`STAFF` (la agenda completa de su sede, todos los clientes del tenant). Esta
fase restringe eso sin tocar en nada el comportamiento de `OWNER`/`ADMIN`/
`STAFF`, que siguen viendo todo igual que siempre.

Regla de negocio, en dos partes porque `Client` no tiene `locationId` propio
(a diferencia de `Appointment`) y por lo tanto no puede evaluarse por sede:

1. **Agenda** (`src/app/dashboard/[tenantSlug]/page.tsx` +
   `updateAppointmentStatusAction`): se evalúa **por sede puntual**, con
   `getRoleAtLocation` (nueva, en `src/lib/authorization.ts` — aprovecha que
   `StaffLocationRole` tiene `@@unique([userId, locationId])`, así que un
   usuario tiene a lo sumo un rol por sede). Si el rol del usuario en la sede
   que está viendo/tocando es `PROFESSIONAL`, se filtra por su
   `professionalId` vinculado (ver `Professional.userId`); si es cualquier
   otro rol, cero cambios de comportamiento. Un mismo usuario puede ser
   `PROFESSIONAL` en una sede y `STAFF`/`ADMIN` en otra (ver la fase de
   vínculo Profesional↔Usuario) — la restricción se recalcula cada vez que
   cambia la sede seleccionada, nunca es "todo o nada" a nivel de usuario.
2. **Clientes** (`clients/page.tsx`, `clients/[clientId]/page.tsx`,
   `clients/actions.ts`, `clients/new/page.tsx`): se evalúa **a nivel de
   tenant completo**, con `isProfessionalOnlyInTenant` (nueva, misma
   ubicación) — true solo si el usuario tiene al menos un rol en el tenant y
   TODOS esos roles son `PROFESSIONAL` (nunca `OWNER`/`ADMIN`/`STAFF` en
   ninguna sede). Si tiene cualquier otro rol en cualquier sede, sigue viendo
   el CRM completo sin cambios — ese otro rol ya implica que necesita esa
   visibilidad más amplia para su trabajo.

`src/lib/professionalScope.ts` (nuevo) — `getLinkedProfessionalId(userId)`,
un `prisma.professional.findUnique({ where: { userId } })` centralizado,
usado en los cinco puntos de arriba. Deliberadamente NO se cachea en el JWT
de la sesión (a diferencia de `locationRoles`): vincular/desvincular un
profesional es poco frecuente y sumarlo al token habría creado otro caso de
"hay que re-loguearse para ver el cambio", igual al que ya existe para
`locationRoles` tras un cambio en Equipo.

Alcance de "clientes", detallado porque tiene más matices que la agenda:
- **Lista** (`clients/page.tsx`): filtrada a clientes con al menos una cita
  con el profesional vinculado (`appointments: { some: { professionalId } }`).
  El conteo de citas por cliente (columna "Citas") también se filtra con un
  `_count` condicionalmente scoped (`_count.select.appointments.where`) —
  si no, un profesional "solo lo mío" vería el total de citas del cliente
  con TODOS los profesionales del negocio, filtrando indirectamente cuánto
  lo atendieron otros colegas.
- **Detalle** (`clients/[clientId]/page.tsx`) y **edición**
  (`updateClientAction`): mismo filtro sobre el `findFirst` — si no hay
  ninguna cita con el profesional (o el usuario no tiene ningún profesional
  vinculado, usando un string-sentinel que nunca matchea un cuid real como
  fallback), el resultado es el mismo 404 que "este cliente no existe",
  sin filtrar que sí existe para otro profesional del negocio. El
  "Historial de citas" en la página de detalle también se filtra a solo las
  citas propias — el cliente puede haber tenido sesiones con otro
  profesional del mismo negocio, y esas no son de su incumbencia.
- **Creación** (`createClientAction`, `clients/new/page.tsx`): **bloqueada**
  para un usuario "solo profesional", con re-chequeo tanto en la página
  (redirige a `/clients` con un error, para no mostrar un formulario que de
  todos modos va a ser rechazado) como en la Server Action (por si se fuerza
  la ruta a mano). Motivo documentado en el propio código: si se permitiera
  crear, el cliente recién creado quedaría invisible para su propio creador
  hasta que existiera una cita entre ambos — un callejón sin salida
  confuso. Como hoy no existe ningún flujo de "crear cita manual" dentro del
  dashboard (las citas solo se crean vía la agenda pública de reservas),
  crear clientes queda como tarea de recepción/administración, igual que
  gestionar profesionales/sedes/servicios.
- **Límite conocido, aceptado explícitamente y no resuelto en esta fase**:
  `Client.customFields` sigue siendo un único JSON compartido por todo el
  cliente, no por profesional — si el mismo cliente tuvo sesiones con dos
  profesionales distintos del mismo negocio, ambos ven y pueden editar la
  MISMA ficha (por ejemplo, el mismo campo de diagnóstico). Separar eso
  requeriría notas por profesional (un modelo de datos nuevo, con su propia
  migración) y queda fuera de esta fase — documentado como comentario en
  `clients/[clientId]/page.tsx` para que no se confunda con un olvido.

Dos casos límite manejados explícitamente, ambos con "fail closed" (mostrar
menos, nunca de más) en vez de asumir lo contrario:
- Un usuario con rol `PROFESSIONAL` en una sede pero sin ningún
  `Professional.userId` vinculado (no debería pasar en la práctica, porque
  ese rol siempre se crea junto con el vínculo — ver
  `inviteProfessionalAsUserAction`/`linkExistingUserToProfessionalAction` —
  pero por las dudas): la agenda y clientes muestran un mensaje explícito
  ("Tu usuario todavía no tiene un profesional vinculado...") en vez de una
  pantalla vacía sin explicación o, peor, mostrar todo por defecto.
- La `resincronización automática de accesos al cambiar sedes` (el otro
  pendiente que quedó documentado en la fase de vínculo Profesional↔Usuario)
  todavía no estaba resuelta al escribir esta sección (se resolvió después,
  ver "Resincronización automática de accesos al cambiar sedes" más abajo)
  — mientras tanto, si un profesional dejaba de estar asignado a una sede
  vía el checklist de Sedes/Profesionales pero conservaba su
  `StaffLocationRole(PROFESSIONAL)` ahí, esta fase simplemente no le
  mostraba ninguna cita en esa sede (porque ya no tenía ninguna asignada
  ahí), sin romper ni requerir ningún cambio adicional. Con la sincronización
  ya implementada, ese `StaffLocationRole` colgado directamente se borra al
  desasignarlo.

Cambios de código, resumen: `src/lib/authorization.ts` ganó
`getRoleAtLocation` e `isProfessionalOnlyInTenant` (ambas puras, sin acceso a
base de datos, con tests nuevos en `authorization.test.ts`); `src/lib/
professionalScope.ts` es nuevo; `updateAppointmentStatusAction` en
`dashboard/[tenantSlug]/actions.ts` suma una verificación extra (re-validada
contra la base, no contra la sesión) que bloquea a un `PROFESSIONAL` de
cambiar el estado de una cita que no es suya, aunque tenga permiso sobre la
sede. Cero migraciones de Prisma — todo el schema necesario
(`Professional.userId`, `StaffLocationRole.role`) ya existía.

**Verificado en vivo (sesión del 2 ago 2026, contra la base real de Neon)**:
se armó un tenant QA descartable con dos profesionales (A y B) vinculados a
sus propios usuarios en la misma sede, un cliente con citas de ambos y otro
cliente solo con B, y se ejecutaron las consultas Prisma reales de
`page.tsx`/`clients/page.tsx`/`clients/[clientId]/page.tsx` más la lógica de
permisos de `updateAppointmentStatusAction` contra esos datos (vía un script
`tsx` temporal, no a través de sesiones HTTP con cookies — ver nota más
abajo). Confirmado con 25 asserts en verde: (1) la agenda de A solo devuelve
sus propias citas en esa sede, nunca las de B; (2) el chequeo de permisos
bloquea a A cambiar el estado de una cita de B y permite cambiar las
propias; (3) la lista de Clientes de A muestra al cliente compartido pero no
al cliente solo-de-B, y el conteo de citas de ese cliente compartido queda
scoped a las propias de A; (4) el `findFirst` del detalle de cliente
devuelve `null` (equivalente al 404) para el cliente solo-de-B; (5) el
"Historial de citas" del cliente compartido muestra solo las citas de A; (6)
un usuario `OWNER` vinculado como su propio profesional (`isProfessionalOnlyInTenant`)
sigue evaluando `false` — conserva la vista completa. Tenant QA eliminado al
terminar (cascade), confirmado que no quedó ningún resto.
**Seguía sin probar** (al escribir el párrafo anterior): el flujo completo
por navegador con sesiones HTTP reales de A y B (login, clicks) — la
verificación de esa sesión ejercitó las mismas consultas Prisma y funciones
de autorización que usan las páginas/acciones reales, pero no pasó por la
capa de Auth.js/Server Actions en sí.

**Cierre de ese pendiente (sesión de Cowork, 2 ago 2026, navegador real vía
la extensión de Claude in Chrome contra `npm run dev` + la base de Neon)**:
se armó un tenant QA descartable nuevo (`qa-solo-lo-mio`, script
`prisma/qa-professional-scope.ts` — corrido por Jonta en su máquina, ya que
el sandbox de Cowork no tiene salida de red hacia Neon ni puede generar el
engine de Prisma para Linux, confirmado en esta misma sesión) con un OWNER y
dos profesionales A/B con login propio en la misma sede, más un cliente
compartido con una cita `COMPLETED` con cada uno. Con logins reales por la
UI (no scripts contra Prisma): (1) la Agenda de A muestra únicamente su
columna con su cita, la de B no aparece en ningún lado de la semana; (2)
simétrico para B; (3) Clientes de A muestra al cliente compartido con
"Citas: 1", no 2; (4) su ficha de detalle — accedida por la misma URL que
usa B, mismo id de cliente — muestra en "Historial de citas" solo la cita
propia; (5) simétrico para B; (6) el login OWNER del mismo tenant ve la
Agenda completa (ambas columnas, ambas citas), Clientes con "Citas: 2" y el
nav completo (Profesionales, Servicios, Reportes, Equipo, Sedes,
Facturación), sin ningún filtro. El único punto que sigue sin un intento en
vivo es que A no pueda cambiar el estado de una cita de B vía
`updateAppointmentStatusAction` — la UI nunca expone esa opción porque A ni
siquiera ve la cita de B, así que forzarlo requeriría reconstruir a mano el
protocolo `Next-Action` de Server Actions; queda cubierto solo por la
verificación de la sesión anterior (contra la lógica real, vía script) más
la relectura de código de esta sesión. Tenant QA borrado al terminar
(`prisma/qa-professional-scope-cleanup.ts`, cascade confirmado).

## Resincronización automática de accesos al cambiar sedes (sesión de Cowork)

✅ hecho y **verificado en vivo** (sesión de Cowork, 2 ago 2026 — ver nota al
final de esta sección, antes solo se había verificado por `tsc --noEmit` y
llamando a las funciones directamente vía script, sin pasar por la UI real
ni por sesiones de navegador reales). Era el segundo y último
pendiente que había quedado documentado en la fase de vínculo
Profesional↔Usuario: hasta ahora, el checklist de sedes de un profesional
(editable tanto desde `professionals/[professionalId]` como desde
`locations/[locationId]`, dos pantallas distintas que tocan la misma tabla
`ProfessionalLocation`) no tenía ningún efecto sobre el
`StaffLocationRole(PROFESSIONAL)` de su usuario vinculado — asignarlo a una
sede nueva no le daba acceso real para ver su agenda ahí, y desasignarlo
dejaba acceso viejo colgado indefinidamente.

`src/lib/professionalLocationSync.ts` (nuevo) — dos funciones que reciben un
`tx: Prisma.TransactionClient` (para correr dentro de la misma transacción
que ya hace el set-replace de `ProfessionalLocation`, nunca aparte) y una
lista de pares `{ professionalId, locationId }`:
- `grantProfessionalLocationAccess`: por cada par recién agregado, si el
  profesional tiene un usuario vinculado, hace un `upsert` de
  `StaffLocationRole` con `create: { role: "PROFESSIONAL" }` y `update: {}`
  — si el usuario YA tenía cualquier rol en esa sede (PROFESSIONAL de antes,
  o incluso OWNER/ADMIN/STAFF), el `update: {}` es un no-op y ese rol
  existente queda intacto, nunca se pisa.
- `revokeProfessionalLocationAccess`: por cada par recién quitado, hace un
  `deleteMany` con `where: { userId, locationId, role: "PROFESSIONAL" }` —
  el filtro por rol en el `where` hace que el delete sea un no-op silencioso
  si el rol actual del usuario ahí es otro. Esto es lo que protege
  explícitamente el caso ya resuelto en la fase anterior de "el OWNER se
  vincula a sí mismo como su propio profesional": si a ese OWNER lo
  desasignan de una sede como profesional, su rol OWNER ahí no se toca.

Ambas funciones son no-ops silenciosos para un profesional sin usuario
vinculado (`userId: null`), que es el caso más común en la práctica (la
mayoría de los profesionales no tienen login propio).

Aplicado en los dos lugares donde se edita `ProfessionalLocation`, ambos
reescritos para calcular el diff (agregados/quitados) ANTES de tocar la
base, en vez del `deleteMany` + `upsert` opaco de antes:
- `applyProfessionalLocationsUpdate` (`professionals/actions.ts`, usada por
  `updateProfessionalAction` — checklist de sedes desde la ficha del
  profesional).
- `applyLocationProfessionalsUpdate` (`locations/actions.ts`, usada por
  `updateLocationProfessionalsAction`/`updateLocationAndProfessionalsAction`
  — checklist de profesionales desde la ficha de la sede).

Ambas ahora usan `prisma.$transaction(async (tx) => {...})` en vez del
array-form `prisma.$transaction([...])` que tenían antes, porque hace falta
leer (`currentAssignments`) antes de decidir qué diff aplicar y las
funciones de sync también necesitan `tx`. `createProfessionalAction`
(alta de un profesional nuevo, con su propio checklist de sedes) NO se tocó
a propósito: en ese momento el profesional recién se está creando, así que
`Professional.userId` todavía es `null` siempre — el sync ya sería un no-op
ahí, no vale la pena sumar la complejidad.

Sin tests unitarios nuevos (mismo criterio que
`deductInventoryForCompletedAppointment` en `src/lib/inventory.ts`, que
tampoco tiene: ambas funciones dependen de un `Prisma.TransactionClient`
real, no de lógica pura, así que en este proyecto se verifican en vivo en
vez de con mocks).

**Verificado en vivo (sesión del 2 ago 2026, contra la base real de Neon)**:
llamando directamente a `grantProfessionalLocationAccess`/
`revokeProfessionalLocationAccess` (mismas funciones que usan
`applyProfessionalLocationsUpdate` y `applyLocationProfessionalsUpdate`)
dentro de transacciones reales sobre datos QA descartables: (1) asignar a un
profesional con usuario vinculado a una sede nueva crea su
`StaffLocationRole(PROFESSIONAL)` ahí; (2) desasignarlo borra ese rol; (4)
caso crítico — el OWNER vinculado a sí mismo como su propio profesional:
desasignarlo de una sede como profesional deja su rol `OWNER` ahí intacto
(el `where: { role: "PROFESSIONAL" }` del delete correctamente no matchea su
fila `OWNER`). No se repitió (3) por separado (editar desde la ficha de la
SEDE) porque ambas puntas llaman exactamente a las mismas dos funciones de
`professionalLocationSync.ts` ya verificadas — no hay lógica adicional que
difiera entre los dos call sites. (5) no se probó explícitamente pero es
trivial por lectura de código: ambas funciones hacen `continue` de
inmediato si el profesional no tiene `userId`.
**Seguía sin probar** (al escribir el párrafo anterior): el re-login real
para confirmar que `locationRoles` del JWT se actualiza (limitación ya
conocida y documentada del proyecto, no específica de esta fase).

**Cierre de ese pendiente (sesión de Cowork, 2 ago 2026, navegador real vía
la extensión de Claude in Chrome contra `npm run dev` + la base de Neon)**:
se armó un tenant QA descartable nuevo (`qa-resync-sedes`, script
`prisma/qa-location-sync.ts` — corrido por Jonta en su máquina) con un OWNER
(rol `OWNER` solo en Sede X, y vinculado además como su propio profesional
"Dueño (QA)" asignado a Sede X — caso 4), un "Profesional Sync (QA)" con
login propio asignado solo a Sede X al arrancar (casos 1/2/3), y un
"Profesional Sin Login (QA)" sin usuario vinculado, asignado a Sede X (caso
5). Con logins y clicks reales por la UI (no scripts contra Prisma) se
recorrieron los 5 casos en orden:

(1) Ya estaba confirmado de una verificación previa en esta misma sesión:
asignarle Sede Y a "Profesional Sync (QA)" desde su propia ficha
(`professionals/[id]`) y guardar hizo que su login mostrara el selector de
sede con ambas sedes disponibles. (2) Quitarle la casilla de Sede X desde
esa misma ficha y guardar dejó su Agenda mostrando únicamente "Sede Y (QA)",
sin selector — perdió el acceso real, no solo la asignación de
`ProfessionalLocation`. (3) Se repitieron ambas direcciones editando esta
vez desde la ficha de la SEDE (`locations/[id]`) en vez de la del
profesional: re-marcar "Profesional Sync (QA)" en el checklist de Sede X y
guardar le devolvió el selector con ambas sedes; volver a desmarcarlo ahí
mismo y guardar lo dejó de nuevo solo con Sede Y — confirmando que ambos
puntos de edición (ficha de profesional y ficha de sede) disparan la misma
sincronización con el mismo resultado. (4) Caso crítico: desde la ficha de
"Dueño (QA)" (el profesional vinculado al propio OWNER) se le quitó la
única sede que tenía asignada (Sede X) y se guardó — el usuario
`owner-resync-qa@qa.test` conservó acceso completo a `/locations` (con
"Nueva sede" habilitado, propio de OWNER) inmediatamente después, sin
relogin: si `revokeProfessionalLocationAccess` hubiera borrado su rol
`OWNER` en Sede X en vez de solo el `PROFESSIONAL` inexistente, esa página
habría devuelto 404 (`requireOwnerAccess` exige el rol en alguna sede del
tenant). (5) Se cambió el checklist de sedes de "Profesional Sin Login
(QA)" (quitar Sede X, agregar Sede Y) desde su propia ficha — al no tener
usuario vinculado, no hay login para verificar por UI, así que se confirmó
por inspección directa de la base
(`prisma/qa-location-sync-inspect.ts`, corrido por Jonta): el dump final de
`StaffLocationRole` solo lista dos filas en todo el tenant
(`owner-resync-qa@qa.test → OWNER` en Sede X, `profesional-sync-qa@qa.test →
PROFESSIONAL` en Sede Y) — ninguna fila para "Profesional Sin Login (QA)"
en ningún lado, pese a que su `ProfessionalLocation` sí cambió de Sede X a
Sede Y, confirmando que ambas funciones de sync siguen siendo no-ops
silenciosos para un profesional sin usuario. El mismo dump confirmó de paso
(1)-(4): "Dueño (QA)" con cero sedes asignadas, "Profesional Sync (QA)" con
Sede Y únicamente, y el único rol en Sede X siendo el `OWNER` del dueño —
sin ningún `PROFESSIONAL` colgado ahí. Tenant QA borrado al terminar
(`prisma/qa-location-sync-cleanup.ts`, cascade confirmado).

## Costo por insumo, comisión por servicio, reporte de consumo, alertas de stock bajo por WhatsApp (sesión de Cowork)

Cuatro pendientes de Servicios/Inventario/Reportes, elegidos juntos por Jonta
(los cuatro a la vez, vía multiSelect) e implementados en la misma sesión.
✅ hecho. Durante la implementación se confirmó una limitación nueva y más
severa del sandbox de Cowork: no solo `prisma migrate`/`validate` están
bloqueados (ya sabido), sino que `npx prisma generate` también lo está — los
binarios de motor cacheados en `node_modules/.cache/prisma` son de Windows
(sincronizados desde la máquina real de Jonta), pero el sandbox es Linux, y
descargar un motor Linux nuevo da 403 contra `binaries.prisma.sh` incluso con
`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`. Por eso el código de esta fase se
escribió primero solo con revisión manual (sin poder compilar), y quedó
pendiente de que Jonta corriera `npm run db:migrate` en su máquina real
(mismo `node_modules`, visible después para el sandbox por ser carpeta
montada) para aplicar las 4 migraciones y regenerar el Prisma Client.

**Verificado después de que Jonta corrió `npm run db:migrate` en su
máquina**: `npx tsc --noEmit` sale limpio (cero errores, incluidos los 4
campos nuevos: `InventoryItem.unitCost`, `Tenant.lowStockAlertPhone`,
`Service.commissionRate`, `Appointment.commissionPaidAt`) y `npm run test`
corrido por Jonta en su máquina real (el sandbox de Cowork no puede correr
vitest — le falta el binario nativo `@rolldown/binding-linux-x64-gnu`, un
problema del entorno, no del proyecto) dio 79/79 tests pasando en 12
archivos, incluyendo `inventory.test.ts` (4 tests, `crossedLowStockThreshold`)
y `reports.test.ts` (6 tests) sin ninguna regresión.

**Todavía sin verificar en vivo contra la base de datos real** (correr los
tests unitarios no reemplaza probar el flujo completo end-to-end): cargar un
costo real en un insumo, poner un % de comisión en un servicio y completar
una cita real de ese servicio, marcar una comisión como pagada dos veces
seguidas, y configurar un número de alerta y cruzar el umbral de stock bajo
para confirmar que efectivamente se intenta un envío de WhatsApp — ver la
lista detallada de casos recomendados más abajo.

**Costo por insumo** — `InventoryItem.unitCost` (`Decimal? @db.Decimal(10,
2)`, migración `20260731220000_add_inventory_item_unit_cost`). Mismo
patrón sin moneda propia que `Service.price`. `null` = costo no cargado
todavía, deliberadamente distinto de "cuesta 0" (importa para el reporte de
consumo, que necesita poder decir "sin costo cargado" en vez de mostrar
USD 0.00). Campo opcional en los forms de crear/editar ítem
(`inventory/new/page.tsx`, `inventory/[itemId]/page.tsx`,
`inventory/actions.ts` — `parseItemFields`/`validateItemCost`), mostrado
también en el panel de stock del ítem cuando está cargado.

**Comisión por servicio (override)** — `Service.commissionRate` (`Decimal?
@db.Decimal(5, 2)`, migración `20260731221000_add_service_commission_rate`).
Si es `null` (default, la gran mayoría de los servicios) se sigue usando el
% del profesional sin ningún cambio; si tiene un valor, ESE servicio paga
siempre ese % sin importar quién lo haga (ej. "los masajes pagan 40% fijo").
Campo opcional (0–100 o vacío) agregado a `services/new/page.tsx`,
`services/[serviceId]/page.tsx` y validado en `services/actions.ts`
(`parseServiceFields`/`validateServiceFields`).

**Comisión pagada (tracking)** — `Appointment.commissionPaidAt` (`DateTime?`,
migración `20260731221500_add_appointment_commission_paid_at`). `null` =
comisión pendiente. Se marca en LOTE desde Reportes, nunca cita por cita:
`markCommissionAsPaidAction` (`reports/actions.ts`) hace un `updateMany`
sobre las citas `COMPLETED` de un profesional dentro del rango de fechas
actualmente visible en la página que todavía tengan `commissionPaidAt: null`
— idempotente por diseño (el propio `where` excluye lo ya pagado, así que un
segundo click no hace nada). `src/lib/reports.ts` (`computeReportData`) se
reescribió para calcular la comisión **por cita** (no por profesional en
bloque como antes) — por cada cita `COMPLETED` de un profesional, usa
`appointment.service.commissionRate` si existe, si no
`professional.commissionRate` (el de siempre), calcula
`calculateCommissionAmount` por cita y la suma a `paidCommissionAmount` si
`commissionPaidAt` está seteado o a `pendingCommissionAmount` si no —
redondeando a 2 decimales solo al final para evitar arrastre de error de
punto flotante en la suma. La tabla de comisiones en `reports/page.tsx`
ganó columnas "Pagada"/"Pendiente" y un botón "Marcar como pagada" por fila
(solo si `pendingCommissionAmount > 0`), preservando el rango de fechas
actual vía inputs ocultos. El export CSV (`reports/export/csv/route.ts`,
sección `comisiones`) y el PDF (`src/pages/api/reports/[tenantSlug]/pdf.tsx`)
se actualizaron con las mismas dos columnas nuevas, para que los tres nunca
puedan mostrar números distintos entre sí (mismo principio de "única fuente
de verdad" que ya seguía `computeReportData`).

**Reporte de consumo de insumos** — nueva función `computeInventoryConsumption(tenantId,
from, to)` en `src/lib/reports.ts`: lee `InventoryMovement` tipo `OUT` en el
rango de fechas (filtrado por `createdAt`, no por `Appointment.startsAt` —
un movimiento de inventario no tiene fecha de cita propia), agrupa por
`itemId`, separa `automaticQuantity` (movimientos con `appointmentId`
seteado, ver la fase de vínculo servicio↔insumo) de `manualOutQuantity`
(sin `appointmentId`), y valoriza (`totalValue = totalQuantity * unitCost`)
solo si el ítem tiene `unitCost` cargado — si no, `totalValue: null` y la UI
muestra "Sin costo cargado" en vez de USD 0.00. Sección nueva "Consumo de
insumos" en `reports/page.tsx`, gateada por `planIncludesModule(tenant.plan,
"inventory")` (hereda el mismo gating que el resto del módulo de
Inventario, no uno nuevo) con su propio export CSV (`section=consumo` en
`reports/export/csv/route.ts`). Deliberadamente NO se agregó al PDF (ver el
límite ya documentado de "gráficos dentro del PDF: fuera de esta fase" —
mismo motivo: requeriría más trabajo de layout con `@react-pdf/renderer`
sin un beneficio claro sobre el CSV para esta sección tabular).

**Alertas de stock bajo por WhatsApp** — reutiliza toda la infraestructura
de WhatsApp existente (`src/lib/whatsapp.ts`), sumando un tercer par
`buildLowStockAlertTemplatePayload`/`sendLowStockAlertWhatsAppMessage` (mismo
patrón que recordatorios de cita y seguimiento de recompra — nunca lanza,
plantilla nueva `alerta_stock_bajo`/`es_MX` pendiente de aprobación en Meta,
igual que las otras dos). `Tenant.lowStockAlertPhone` (`String?`, migración
`20260731220500_add_tenant_low_stock_alert_phone`) — un solo número por
tenant, no por sede/usuario, configurable desde una sección nueva en
`inventory/page.tsx` ("Alertas de stock bajo por WhatsApp", visible solo
para OWNER/ADMIN) vía `updateLowStockAlertPhoneAction`
(`inventory/actions.ts`, mismo guard `requireInventoryManageAccess` que
crear/editar ítems) — campo vacío desactiva las alertas (`null`), un número
no válido según `normalizePhoneForWhatsapp` se rechaza sin guardar.

Lógica de detección centralizada en `src/lib/inventory.ts`:
`crossedLowStockThreshold(previousQuantity, newQuantity, lowStockThreshold)`
(pura, con tests en `inventory.test.ts`) — devuelve `true` solo si el stock
ANTES del movimiento estaba por encima del umbral y el de DESPUÉS quedó en
el umbral o por debajo, para que una seguidilla de salidas mientras el
stock ya está bajo no dispare un WhatsApp por cada una, solo la primera vez
que lo cruza de verdad. Aplicada en los dos puntos donde se genera una
salida de inventario:
- `deductInventoryForCompletedAppointment` (descuento automático al
  completar una cita) ahora lee el stock ANTES del `upsert` (una consulta
  extra por insumo, solo para poder comparar — el `upsert` en sí sigue
  siendo el mismo decrement atómico de antes) y devuelve la lista de
  insumos que cruzaron el umbral en vez de `void`.
  `updateAppointmentStatusAction` (`dashboard/[tenantSlug]/actions.ts`)
  guarda ese resultado y llama a `maybeSendLowStockAlerts` **después** de
  que la transacción de Prisma ya confirmó, nunca adentro — un envío de red
  no debe vivir dentro de una transacción de base de datos, y así un
  rollback nunca podría dejar un WhatsApp ya enviado sobre un cambio que no
  se aplicó.
- `recordInventoryMovementAction` (`inventory/actions.ts`, movimiento
  manual): mismo criterio — el chequeo de cruce ocurre dentro de la
  transacción visto que ya se lee el stock actual ahí (`INSUFFICIENT_STOCK`
  ya validaba eso desde la fase de Inventario original), pero el envío en sí
  (`maybeSendLowStockAlerts`) se dispara después, fuera del `try/catch`, con
  `void` (fire-and-forget, no bloquea el redirect ni la respuesta al
  usuario). Un `IN` nunca puede cruzar el umbral hacia abajo, así que el
  chequeo solo aplica a `type === "OUT"`.

`maybeSendLowStockAlerts` (mismo archivo) es la que de verdad hace el envío:
si `Tenant.lowStockAlertPhone` no está configurado o no normaliza a un
número válido, es un no-op silencioso — ni siquiera intenta llamar a la API
de Meta. Nunca lanza (mismo criterio que el resto de los envíos de WhatsApp
del proyecto): si Meta rechaza el mensaje (sin token, plantilla no
aprobada, etc.) el movimiento de inventario o el cambio de estado de la
cita que lo originó ya se aplicaron igual, sin revertirse.

Fuera de esta fase: ninguna de las cuatro. Específicamente sin resolver
todavía: notificar por WhatsApp/email cuando una comisión se marca como
pagada, edición del `type` de un campo de costo ya cargado más allá de
sobreescribir el número, más de un número de alerta de stock bajo por
tenant (ej. uno por sede), y — como ya se documentó arriba — la aprobación
real de la plantilla `alerta_stock_bajo` en Meta (trámite manual, no de
código, igual que `recordatorio_cita`/`seguimiento_recompra`).

**Verificado en vivo (sesión del 2 ago 2026, contra la base real de Neon,
tras confirmar que las 4 migraciones de esta fase ya estaban aplicadas —
`prisma migrate status` dio "up to date")**: con un tenant QA descartable
(insumo con `unitCost` cargado, servicio con `commissionRate` override,
otro servicio sin override) se llamó directamente a
`deductInventoryForCompletedAppointment`, `computeReportData` y
`computeInventoryConsumption` (las mismas funciones que usan la página y los
exports CSV/PDF) más un `updateMany` idéntico al de
`markCommissionAsPaidAction`. Confirmado: (1) el reporte de consumo valoriza
correctamente `cantidad × unitCost`; (2) la comisión de una cita de un
servicio con override usa ese % (40%) e ignora el % default del profesional
(20%), mientras que un servicio sin override sigue usando el % del
profesional; (3) marcar como pagada una segunda vez sobre el mismo rango es
idempotente — el `where: { commissionPaidAt: null }` hace que el segundo
`updateMany` no toque nada, y el split pagado/pendiente calculado por
`computeReportData` da el mismo número en ambas corridas; (4) el descuento
de stock que cruza el umbral (stock previo > umbral, posterior ≤ umbral)
devuelve el candidato para alertar exactamente una vez, y una segunda salida
mientras el stock ya está en/bajo el umbral no lo vuelve a "cruzar"
(`crossedLowStockThreshold`, ya cubierta también por tests unitarios); (5)
`maybeSendLowStockAlerts` con `Tenant.lowStockAlertPhone: null` es un no-op
inmediato, sin llegar a intentar ningún fetch.
**Deliberadamente NO se disparó un envío real de WhatsApp**: el proyecto ya
tiene credenciales reales de Meta cargadas en `.env` (ver la sesión de
integración de WhatsApp más abajo), así que configurar un teléfono y dejar
correr `maybeSendLowStockAlerts` habría hecho una llamada real a la API de
Meta — evitado a propósito para no gastar cuota ni arriesgar un envío
indeseado con la plantilla `alerta_stock_bajo` (todavía en revisión). El
camino de "sí hay teléfono configurado" se validó por lectura de código
(mismo patrón ya probado en vivo para recordatorios de cita y seguimiento de
recompra), no por una llamada real en esta sesión.

## Paquetes y bonos de sesiones + alerta de vencimiento por WhatsApp

✅ hecho y verificado en vivo (sesión con Claude Code fuera de VS Code, sin
acceso a navegador — verificación por script real contra la base de Neon, no
por revisión de código ni por sesión HTTP con cookies; ver el detalle de qué
sí y qué no se probó al final de esta sección). Primer módulo de nicho de los
8 que describe el roadmap de producto (`RIME - Estado del proyecto y
roadmap.md`, sección "multi-industria con plantillas por rubro") — grupo
estética ("línea de tiempo de fotos y alertas de paquete"), elegido por
Jonta entre esos 8 para arrancar. Los otros 7 (receta digital, auto-agendar
seguimiento, línea de tiempo de fotos, racha de constancia, lista de espera
inteligente, ficha de preferencias, portabilidad de cliente) siguen sin
empezar — quedan como fases aparte, mismo criterio de fases chicas y
verificadas que ya sigue el proyecto.

Modelo nuevo `SessionPackage` (tenantId, clientId, `serviceId` opcional —
informativo, no se valida contra la cita al redimir, porque un paquete no
tiene por qué estar atado a un único servicio —, totalSessions, usedSessions
default 0, price opcional, purchasedAt, expiresAt opcional, status
`SessionPackageStatus` default ACTIVE). Nunca se borra: pasa a COMPLETED
automáticamente cuando usedSessions llega a totalSessions, o a CANCELLED
manual — mismo criterio que Profesionales/Sedes/Inventario. `PackageRedemption`
(packageId, `appointmentId` opcional y `@unique` — Postgres permite múltiples
NULL en una columna unique, así que no fuerza vincular cada redención a una
cita) registra cada sesión redimida.

Redención **manual**, nunca automática al completar una cita (a diferencia de
`ServiceInventoryItem`/Inventario): un cliente puede tener paquetes ambiguos
entre sí (dos paquetes activos, o un paquete sin `serviceId`), y este
proyecto ya prefiere una acción manual explícita sobre inventar un vínculo
automático ambiguo (mismo criterio que el pago de comisiones en lote desde
Reportes). `redeemPackageSessionAction` acepta un `appointmentId` opcional
tomado de un `<select>` con las citas `COMPLETED` del cliente que todavía no
tienen ninguna `PackageRedemption` — solo para trazabilidad de "qué visita
usó esta sesión", sin disparar nada solo.

**Hallazgo durante el diseño, no relacionado con este módulo**: `NotificationQueue`
distinguía el tipo de aviso (recordatorio de cita vs. aviso de recompra) de
forma implícita, por la combinación de `appointmentId`/`clientId` null —
invariante que un tercer tipo (`clientId` set, `appointmentId` null, igual
que recompra) rompe. Se agregó un discriminador real (`NotificationQueue.kind`,
enum `NotificationKind`), con backfill manual de las filas existentes
(`prisma migrate dev --create-only` + edición a mano del SQL generado — este
proyecto no tenía precedente de una migración con `UPDATE`, siempre fueron
columnas nuevas nullable o enums aditivos). Al escribir el `kind` de esta
migración se detectó que `send-reminders` (cron horario, sin ningún filtro
por `appointmentId`/`clientId`, solo `{channel, status, scheduledFor}`) podía
agarrar una fila de recompra recién encolada por `detect-inactive-clients`
(06:00, `scheduledFor: now`) **antes** de que `send-followup-reminders`
(08:00) llegara a procesarla, marcándola `FAILED` con
`appointment_cancelled_or_missing` por no tener `appointment` — un bug
latente ya en producción, silenciando avisos de recompra, sin relación con
paquetes. Las tres rutas de cron existentes (`send-reminders`,
`send-followup-reminders`, más `detect-inactive-clients` al crear la fila)
ahora filtran/escriben `kind` explícitamente, lo que cierra ese bug como
efecto colateral necesario del cambio de esquema. `NotificationQueue` también
ganó `packageId` opcional (además de `kind`): un cliente puede tener más de
un paquete por vencer a la vez, así que el dedup de la alerta es por
`packageId` puntual, no solo por `clientId` (a diferencia de recordatorio/
recompra, que son 1:1 con su cita/cliente).

Alertas: cron nuevo `detect-expiring-packages` (paquetes `ACTIVE` con
`usedSessions < totalSessions` y `expiresAt` dentro de una ventana de 7 días
—`PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS` en `src/lib/packages.ts`—, filtrado
por tenants cuyo plan incluye el módulo `"packages"`) encola
`NotificationQueue` (`kind: PACKAGE_EXPIRATION`). Cron nuevo
`send-package-expiration-alerts` lo procesa vía un 4º triplete en
`src/lib/whatsapp.ts` (`buildPackageExpirationTemplatePayload`/
`sendPackageExpirationWhatsAppMessage`, plantilla nueva
`alerta_paquete_vencimiento`/`es_MX` — pendiente de aprobación en Meta igual
que las otras 3, trámite manual no de código). Ambos crons agregados a
`vercel.json` en horarios escalonados de los existentes (07:00 detección,
10:00 envío).

Gating: nuevo módulo `"packages"` en `PlanModule`
(`src/lib/planLimits.ts`), mismo tier que `inventory`/`reengagement`
(PREMIUM y PRO, no INDIVIDUAL/BASICO). `requirePackagesAccess`
(`src/lib/auth-guards.ts`, chequeo de plan, redirige a `/plan-required?
feature=paquetes&requiredPlan=PREMIUM`) para ver/redimir — cualquiera con
acceso al dashboard; `requirePackagesManageAccess` (además OWNER/ADMIN,
mismo split que Inventario) para crear/cancelar un paquete.

UI: sección "Paquetes de sesiones" embebida en
`clients/[clientId]/page.tsx` (no es un catálogo tenant-wide como Inventario/
Servicios — un paquete pertenece a un cliente, igual que su historial de
citas), oculta (nunca redirige) si el plan no incluye el módulo — un tenant
BASICO/INDIVIDUAL sigue viendo el resto de la ficha del cliente sin cambios.
Las tres acciones nuevas (`createPackageAction`, `redeemPackageSessionAction`,
`cancelPackageAction`) viven en el `clients/actions.ts` ya existente, no en un
archivo aparte — este proyecto tiene exactamente un `actions.ts` por carpeta
del dashboard, sin excepción, en las 9 carpetas revisadas.

**Verificado en vivo (sin navegador — este entorno no tenía uno disponible en
esta sesión, a diferencia de las sesiones de Cowork anteriores)**: sembrado un
tenant QA descartable (`prisma/qa-paquetes.ts`, plan PREMIUM) con 4 paquetes
de un mismo cliente en los cuatro casos relevantes (por vencer con sesiones
disponibles / sin sesiones disponibles aunque venza pronto / vencimiento
lejano / sin fecha de vencimiento). `prisma/qa-paquetes-verify.ts` llamó
directamente a la función `GET` real de `detect-expiring-packages` (mismo
código que correría en producción, con una `Request` construida a mano y el
`CRON_SECRET` real) dos veces seguidas: la primera encoló exactamente el
paquete "por vencer con sesiones disponibles" (`scanned: 3` — el de
`expiresAt: null` ni siquiera entra a la query —, `enqueued: 1`) con el
payload correcto (`remainingSessions: 1`, teléfono normalizado); la segunda
dio `enqueued: 0`, confirmando el dedup por `packageId`. Redimir la única
sesión disponible del paquete "por vencer" (mismas operaciones de Prisma que
`redeemPackageSessionAction`) lo dejó en 3/3 con `status: COMPLETED`, y
`canRedeemSession` pasó a `false` tanto para ese paquete como para el que ya
estaba en 5/5 desde el inicio. Tenant QA borrado al terminar
(`prisma/qa-paquetes-cleanup.ts`, cascade confirmado) y confirmado por
separado que el tenant demo (`consultorio-demo`, 3 sedes, 2 usuarios) quedó
exactamente igual que antes.

**Deliberadamente NO verificado en esta sesión**: `send-package-expiration-alerts`
nunca se corrió contra las filas encoladas — `WHATSAPP_CLOUD_API_TOKEN` en
`.env` es una credencial real de Meta y la plantilla
`alerta_paquete_vencimiento` no existe/no está aprobada todavía, mismo
criterio ya documentado arriba para `alerta_stock_bajo` (evitar gastar cuota
o arriesgar un envío indeseado); queda cubierto solo por el test unitario de
`buildPackageExpirationTemplatePayload`. Tampoco se probó ningún flujo por
navegador real (login, clicks) — a diferencia de las sesiones de Cowork
anteriores, este entorno no tenía uno disponible; las Server Actions
(`createPackageAction`/`redeemPackageSessionAction`/`cancelPackageAction`)
están cubiertas por `tsc --noEmit` limpio y por la verificación de la lógica
de Prisma que ejecutan (idéntica a la que corrió `qa-paquetes-verify.ts`),
pero no por una sesión HTTP real con `requirePackagesAccess`/
`requirePackagesManageAccess` de por medio. Fuera de esta fase: marcar
`SessionPackageStatus.EXPIRED` automáticamente cuando pasa la fecha sin
usarse todas las sesiones (hoy el paquete queda `ACTIVE` para siempre si
nadie lo cancela a mano — el enum ya tiene el valor pero nada lo asigna),
más de una alerta por paquete (ej. "vence en 7 días" y otra distinta "vence
mañana"), y los otros 7 módulos de nicho del roadmap.

## Ficha de preferencias + portabilidad de cliente (barbería) + racha de constancia (bienestar)

✅ hecho y verificado en vivo (mismo entorno sin navegador que la fase
anterior — ver el mismo criterio de verificación al final de esta sección).
Tres módulos de nicho más de los 8 del roadmap, agrupados en una sesión por
ser chicos y no pisarse entre sí.

**Ficha de preferencias (barbería)**: nueva vertical `BARBERIA` en el enum
`TenantVertical` (migración `add_barberia_vertical`, puramente aditiva) +
plantilla fija en `src/lib/clientFieldTemplates.ts` (estilo preferido,
máquina/milímetro habitual, productos preferidos, alergias a productos) —
mismo patrón que las 5 verticales existentes, cero código nuevo más allá de
la plantilla (`getEffectiveClientFieldTemplate` ya es genérico). Agregada
también a `VERTICAL_OPTIONS` (`signup/page.tsx`) y `VALID_VERTICALS`
(`signup/actions.ts`) — sin esto, un tenant nuevo no podía elegir la
vertical aunque el schema ya la soportara. El test existente
`clientFieldTemplates.test.ts` ya iteraba `Object.values(TenantVertical)`,
así que cubrió la vertical nueva sin tocar el archivo de test.

**Portabilidad de cliente (barbería)**: nuevo route handler
`GET /dashboard/[tenantSlug]/clients/[clientId]/export` — descarga un JSON
con el registro completo de UN cliente puntual (ficha con **etiquetas
legibles**, no las keys camelCase internas — pensado para que el archivo se
pueda leer o llevar a otro negocio sin conocer el esquema de RIME), su
historial de citas y sus paquetes de sesiones si el módulo está habilitado.
Distinto del pendiente ya documentado en el roadmap de producto
("Descargar mis datos" en Mi cuenta, que es la cuenta del NEGOCIO completa,
sigue sin resolver) — este es portabilidad de UN cliente, no del tenant
entero. Mismo guard y mismo criterio "solo lo mío" que la página de detalle
del cliente (`requireDashboardAccess` + `isProfessionalOnlyInTenant`/
`getLinkedProfessionalId`) — un profesional sin otro rol en el tenant solo
puede exportar clientes con los que tiene alguna cita, y el historial
exportado se filtra a sus propias citas, igual que ya hace la página. Link
"Descargar datos" agregado junto al nombre del cliente en
`clients/[clientId]/page.tsx`.

**Racha de constancia (bienestar)**: `computeWeeklySessionStreak` en
`src/lib/streak.ts` (pura, con tests) — cuenta semanas consecutivas (ventana
de 7 días terminando en `now`) con al menos una cita `COMPLETED`, empezando
por la semana actual; si no hubo ninguna cita completada en los últimos 7
días la racha es 0 (no se arrastra una racha vieja ya cortada). Deliberadamente
**sin gating de vertical**: igual que el CRM predictivo de recompra, es una
señal de CRM útil para cualquier negocio (fitness, spa, incluso adherencia a
tratamientos de salud), no exclusiva de una vertical puntual — no se creó
ninguna vertical `FITNESS`/`SPA` nueva solo para esto. Se calcula sobre las
mismas citas que ya carga `clients/[clientId]/page.tsx` para el historial
(sin query nueva) y se muestra como badge 🔥 junto al nombre del cliente solo
si la racha es de 2 semanas o más (una racha de 1 no es "constancia" todavía,
es solo "vino esta semana"). Mismo límite ya aceptado por el resto de la
página para un login `PROFESSIONAL` "solo lo mío": la racha ahí solo cuenta
las semanas con sesión CON ESE profesional, no con el negocio en general.

**Verificado en vivo (script real contra la base de Neon, sin sesión HTTP —
este entorno no tiene navegador disponible)**: `prisma/qa-portabilidad-racha.ts`
sembró un tenant BARBERIA con un cliente con ficha completa (3 campos de la
plantilla nueva) y 4 citas `COMPLETED` (semanas 0/1/2 consecutivas + semana 5
con hueco a propósito). **Bug real detectado y corregido durante esta
verificación, en el script de QA, no en el código de producto**: la primera
versión de `weeksAgo()` anclaba la fecha de "semana 0" a una hora fija del
día en vez de a `Date.now()`, y esa hora todavía no había pasado en UTC al
momento de correr el script — la cita de "semana actual" quedó en el futuro
por unas horas, corriendo todos los buckets de la racha un lugar (dio 2 en
vez de 3). `computeWeeklySessionStreak` en sí ya estaba cubierta por 6 tests
unitarios con `now` fijo y controlado, y esos siguieron pasando sin cambios
— confirmando que el bug era del script, no de la función. Corregido
anclando `weeksAgo()` a `Date.now()` menos un margen fijo, se volvió a
sembrar y `prisma/qa-portabilidad-racha-verify.ts` (llama directo a
`computeWeeklySessionStreak` con las fechas reales de la base, y replica la
misma consulta + armado de payload que el route handler de export, sin pasar
por `auth()`) confirmó: racha calculada = 3 (correcto); ficha exportada con
las 3 etiquetas legibles esperadas; paquete de sesiones presente en el
export. Tenant QA borrado al terminar
(`prisma/qa-portabilidad-racha-cleanup.ts`, cascade confirmado).

**Deliberadamente NO verificado en esta sesión**: el route handler de export
nunca se invocó por HTTP real (requiere una sesión de Auth.js que este
entorno no puede simular sin navegador) — la lógica que ejecuta (mismas
queries Prisma + `getEffectiveClientFieldTemplate` + `APPOINTMENT_STATUS_LABELS`)
sí se verificó, replicada en el script de verificación, pero no el guard
`requireDashboardAccess` en sí ni el header `Content-Disposition` real del
navegador. Fuera de esta fase: los otros 4 módulos de nicho del roadmap
(lista de espera inteligente, receta digital, auto-agendar seguimiento,
línea de tiempo de fotos).

## Lista de espera inteligente (bienestar)

✅ hecho y verificado en vivo (mismo entorno sin navegador). 6to módulo de
nicho de los 8 del roadmap.

Modelo nuevo `WaitlistEntry` (tenantId, locationId, clientId, serviceId,
`professionalId` opcional — null = cualquier profesional que atienda ese
servicio —, `preferredFrom`/`preferredTo` opcionales para acotar la ventana
de fechas aceptable, status `WaitlistEntryStatus` default WAITING). Nunca se
borra — status pasa a CANCELLED manual, mismo criterio que el resto del
proyecto; BOOKED queda reservado para cuando exista un flujo que lo marque
solo (hoy nada lo asigna, igual que `SessionPackageStatus.EXPIRED`, ya
documentado como hueco aceptado).

**"Inteligente" = nunca bombardear a todos los que esperan un servicio,
solo ofrecerle el cupo al que matchea Y espera hace más tiempo.**
`findBestWaitlistMatch` (`src/lib/waitlist.ts`, pura, con 7 tests) filtra
candidatos `WAITING` por sede+servicio+profesional (o sin preferencia) y
ventana de fechas, y entre los que matchean elige el de `createdAt` más
antiguo. Se engancha en `updateAppointmentStatusAction`
(`dashboard/[tenantSlug]/actions.ts`): cuando una cita pasa a `CANCELLED` y
el plan del tenant incluye `"waitlist"`, dentro de la misma transacción que
ya actualiza el estado de la cita se buscan los `WaitlistEntry` `WAITING` de
esa sede+servicio, se descartan los que no tienen un teléfono normalizable
(no tiene sentido "gastar" el match con alguien a quien no se le puede
avisar — se sigue probando con el siguiente candidato más antiguo, no se
para en el primero sin importar si tiene teléfono), se llama a
`findBestWaitlistMatch`, y si hay ganador se marca `NOTIFIED`
(`notifiedAt: now`) ahí mismo.

**Decisión de diseño que rompe el patrón de las 3 notificaciones anteriores**:
el aviso de WhatsApp (`sendWaitlistSlotOpenedWhatsAppMessage`, 5to triplete
en `src/lib/whatsapp.ts`) se manda **inmediato, fuera de la transacción,
fire-and-forget** — NO pasa por `NotificationQueue` como recordatorio/
recompra/vencimiento de paquete. Motivo explícito, documentado en el propio
código: un cupo recién liberado es urgente — esperar a la próxima corrida
horaria de un cron (como el resto de los avisos ligados a cliente) le daría
tiempo a que otro cliente reserve ese mismo horario por la agenda pública
antes de que el candidato de la lista de espera se entere. `NotificationKind.WAITLIST_SLOT_OPENED`
quedó agregado al enum (mismo tipo de columna que ya obligó a todos los
`notificationQueue.create` del proyecto a especificar `kind`) pero sin uso
real por ahora — reservado por si en el futuro conviene encolar esto
también (ej. para reintentos automáticos si el primer intento falla).

Gating: nuevo módulo `"waitlist"` en `PlanModule`, mismo tier que
`inventory`/`reengagement`/`packages` (PREMIUM y PRO). `requireWaitlistAccess`
sin split de manage-access — a diferencia de Paquetes, anotar o sacar a
alguien de la lista de espera no mueve plata, así que cualquier usuario con
acceso al dashboard puede hacerlo (mismo criterio que registrar un
movimiento de inventario).

UI: sección "Lista de espera" embebida en `clients/[clientId]/page.tsx`
(mismo criterio de placement que Paquetes — es client-scoped, no un catálogo
tenant-wide), oculta sin redirect si el plan no incluye el módulo. Formulario
para unirse (servicio, sede, profesional opcional, ventana de fechas
opcional) y botón "Sacar de la lista" por cada entrada `WAITING`/`NOTIFIED`.
Deliberadamente **sin una página tenant-wide de "ver toda la lista de
espera del negocio"** en esta fase — mismo alcance acotado que Paquetes al
no tener tampoco una vista agregada propia; queda como mejora futura si
hace falta.

**Verificado en vivo (script real contra la base de Neon, sin sesión HTTP)**:
`prisma/qa-waitlist.ts` sembró un tenant PREMIUM con una cita CONFIRMED del
"Profesional A" y 3 clientes en lista de espera del mismo servicio/sede,
creados en orden a propósito para poder confirmar la regla de "más antiguo
que matchea gana": (1) el más antiguo de los tres, sin preferencia de
profesional, pero **sin teléfono válido** — debía ser descartado sin
importar que sea el más antiguo; (2) pide específicamente al "Profesional B"
— no debía matchear porque la cita cancelada es de A; (3) el más nuevo de
los tres, sin preferencia de profesional, con teléfono válido — debía ganar
por ser el único matcheable con teléfono. `prisma/qa-waitlist-verify.ts`
replicó la lógica exacta de la transacción (no pudo invocarse
`updateAppointmentStatusAction` directamente por depender de `auth()`) y
confirmó los tres resultados exactamente como se esperaba: el candidato (3)
quedó `NOTIFIED`, los otros dos siguieron `WAITING`. Tenant QA borrado al
terminar (`prisma/qa-waitlist-cleanup.ts`, cascade confirmado).

**Deliberadamente NO verificado en esta sesión**: el envío real de WhatsApp
(`sendWaitlistSlotOpenedWhatsAppMessage`) nunca se disparó — mismo criterio
que el resto de plantillas nuevas de esta sesión (`alerta_paquete_vencimiento`,
"cupo_lista_espera" tampoco existe/está aprobada en Meta, y
`WHATSAPP_CLOUD_API_TOKEN` es una credencial real). Tampoco se probó
`updateAppointmentStatusAction` en sí por HTTP real (requiere sesión de
Auth.js). Fuera de esta fase: página tenant-wide de lista de espera, marcar
`WaitlistEntryStatus.BOOKED` automáticamente si el candidato notificado
efectivamente reserva ese horario (hoy nada lo asigna, queda en `NOTIFIED`
para siempre salvo que alguien lo cancele a mano), y los otros 3 módulos de
nicho del roadmap (receta digital, auto-agendar seguimiento, línea de
tiempo de fotos — este último el más grande de los 8, sigue sin empezar).

## Receta digital (salud)

✅ hecho y verificado en vivo (mismo entorno sin navegador). 7mo módulo de
nicho de los 8 del roadmap.

Modelo nuevo `Prescription` (tenantId, clientId, professionalId,
`appointmentId` opcional y **no único** — a diferencia de
`PackageRedemption`, de una misma cita pueden salir varias notas/recetas —,
`title` opcional, `content` texto libre `@db.Text`, issuedAt). Deliberadamente
sin campos estructurados de medicamento/dosis: el contenido varía demasiado
entre psicología (plan de tratamiento), nutrición (plan alimentario) y
fisioterapia (indicaciones) como para forzar un esquema rígido único —
mismo criterio ya usado en `Client.customFields`. Nunca se edita ni se
borra una vez creada (registro clínico) — solo se puede agregar una nota
nueva, ninguna acción de editar/cancelar como sí tienen Paquetes/Lista de
espera.

**Decisión de gating distinta al resto de módulos de esta sesión**: el
módulo `"prescriptions"` quedó en `true` para los 4 planes
(`INDIVIDUAL`/`BASICO`/`PREMIUM`/`PRO`), no reservado a PREMIUM/PRO como
Paquetes/Lista de espera/Inventario. Motivo documentado en el propio código
(`planLimits.ts`): la ficha clínica con receta digital es el diferenciador
central del nicho de salud que ya define este proyecto desde su
`CLAUDE.md` original ("sin CIE-10, sin plantillas por especialidad" es
exactamente el hueco que deja AgendaPro) — no es un upsell operativo como
Inventario, es la razón de ser del segmento inicial de mercado. Se modeló
igual como un `PlanModule` más (no un `if` hardcodeado en el código que lo
usa) por si el negocio decide gatearlo distinto más adelante.

PDF: nuevo endpoint en Pages Router
(`src/pages/api/prescriptions/[tenantSlug]/[clientId]/[prescriptionId]/pdf.tsx`),
calcado casi línea por línea del ya existente
`src/pages/api/reports/[tenantSlug]/pdf.tsx` — mismo motivo documentado ahí
(conflicto de `@react-pdf/renderer` con el grafo de módulos "react-server"
de App Router en Next 15), mismo patrón de reimplicar a mano la cadena de
guards con `getToken`/respuestas HTTP planas en vez de
`redirect()`/`notFound()`. Verificado por revisión de código + `tsc`, mismo
criterio que ya usa este proyecto para plantillas de `@react-pdf/renderer`
(el riesgo real — el conflicto de RSC — ya se probó una vez a nivel de
proyecto con una reproducción mínima aislada; no hace falta re-probarlo por
cada plantilla nueva que seguí la misma estructura).

UI: sección "Recetas y notas clínicas" embebida en
`clients/[clientId]/page.tsx` (mismo placement client-scoped que Paquetes/
Lista de espera), usando `tenant.professionals` (ya cargado por
`requireDashboardAccess`) para el selector de profesional en vez de una
query nueva. Cada receta lista un link "PDF" que apunta al endpoint nuevo.

**Verificado en vivo (script real contra la base de Neon, sin sesión HTTP)**:
`prisma/qa-prescriptions.ts` sembró un tenant **INDIVIDUAL** (a propósito,
no PREMIUM — para confirmar que el módulo funciona igual en el plan más
chico) con una receta real (tildes, ñ, contenido multilínea).
`prisma/qa-prescriptions-verify.ts` confirmó: `planIncludesModule(INDIVIDUAL,
"prescriptions")` da `true`; la misma query con scoping tenantId+clientId
que usa el route handler de PDF encuentra la receta con el profesional
"Dra. María José Peña" y el contenido con acentos intactos; forzar un
tenantId o clientId incorrecto en esa misma query devuelve `null` (nunca
filtra datos de otro tenant/cliente). Tenant QA borrado al terminar
(`prisma/qa-prescriptions-cleanup.ts`, cascade confirmado).

**Deliberadamente NO verificado en esta sesión**: el endpoint de PDF nunca
se invocó por HTTP real (requiere una sesión de Auth.js que este entorno no
puede simular sin navegador) — ni el `renderToBuffer` real del componente
de PDF en sí, cubierto en cambio por revisión de código + `tsc` (ver
motivo arriba). Fuera de esta fase: editar/eliminar una receta ya creada,
firma digital del profesional, y el último módulo de nicho del roadmap
(línea de tiempo de fotos — el más grande de los 8, depende de un servicio
de almacenamiento de archivos que el proyecto no tiene todavía).

## Auto-agendar control de seguimiento (salud)

✅ hecho y verificado en vivo (mismo entorno sin navegador). 8vo y último
módulo de nicho del roadmap con lógica propia — línea de tiempo de fotos
queda aparte por depender de una decisión de infraestructura externa (ver
sección siguiente).

**Primer módulo de esta sesión con gating por VERTICAL, no por plan.**
Todos los módulos anteriores (racha, portabilidad) se hicieron deliberadamente
disponibles para cualquier vertical; este es distinto por naturaleza: crear
una cita sola, sin que nadie la pida, tiene sentido para un seguimiento
clínico (psicología/nutrición/fisioterapia) pero sería una sorpresa no
deseada para una barbería o un spa. `isAutoFollowUpVertical` en
`src/lib/followUpScheduling.ts` (pura, con tests) restringe a
`PSICOLOGIA`/`NUTRICION`/`FISIOTERAPIA` — sin módulo de plan de por medio
(disponible en los 4 planes, mismo criterio que Recetas: es parte del
diferenciador de nicho, no un upsell).

**Decisión de diseño confirmada explícitamente antes de implementar**: el
seguimiento se auto-crea **solo si el horario exacto candidato está libre**
— mismo profesional y servicio que la cita original,
`FOLLOW_UP_INTERVAL_DAYS` (14, fijo por ahora) después, mismo horario del
día. Si ese horario puntual ya está ocupado por cualquier otra cita del
mismo profesional (`status` distinto de `CANCELLED`), **no se crea nada** —
nunca elige otro horario por su cuenta ni fuerza un doble-booking; el staff
agenda a mano como siempre. `computeFollowUpSlot`/`isFollowUpSlotFree`
(`src/lib/followUpScheduling.ts`, puras, con tests) separan el cálculo del
candidato de la decisión de si está libre.

Enganchado en `updateAppointmentStatusAction`
(`dashboard/[tenantSlug]/actions.ts`), dentro de la misma transacción que ya
tiene el descuento de inventario y el match de lista de espera: cuando
`nextStatus === "COMPLETED"` y la vertical del tenant es de salud, calcula
el candidato, consulta las citas del mismo profesional que se solapan con
ese horario (`status: { not: "CANCELLED" }`), y si no hay ninguna crea la
cita nueva con `status: PENDING` (necesita confirmación, no se auto-confirma
sola) y el valor nuevo `AppointmentSource.AUTO_FOLLOWUP` — enum nuevo,
migración puramente aditiva, pensado para poder distinguir en reportes/
soporte qué citas se generaron solas vs. las que agendó un humano.

**Deliberadamente fuera de esta fase**: no se encola ningún recordatorio de
WhatsApp para la cita auto-creada (esa lógica vive en la agenda pública de
reservas, `src/app/(public)/[tenantSlug]/actions.ts`, y no se tocó — el
cliente/staff la ve en la agenda interna igual que cualquier otra cita
`PENDING`, pero no dispara el flujo de recordatorio de 24h automáticamente);
sin verificación de horario de atención (`DEFAULT_BUSINESS_HOURS` en
`availability.ts`) — si la cita original fue a una hora fuera del horario
"normal" (ej. una excepción puntual), el seguimiento se ofrece igual a esa
misma hora 14 días después, sin chequearlo contra el horario configurado;
sin verificación de que la sede siga abierta/activa esos días.

**Verificado en vivo (script real contra la base de Neon, sin sesión HTTP)**:
`prisma/qa-auto-followup.ts` sembró dos tenants — uno PSICOLOGIA con dos
citas CONFIRMED (una con el horario candidato libre, otra con el profesional
ya ocupado exactamente en ese horario) y uno ESTETICA con una cita idéntica
a la "libre" para probar el corte por vertical — y
`prisma/qa-auto-followup-verify.ts` replicó la lógica exacta de la
transacción (no pudo invocarse `updateAppointmentStatusAction` directamente
por depender de `auth()`) sobre las 3 citas. Confirmado exactamente como se
esperaba: la cita con horario libre creó su seguimiento (`PENDING`,
`AUTO_FOLLOWUP`, 14 días después, misma hora); la cita con el profesional ya
ocupado no creó nada; la cita en vertical ESTETICA no creó nada pese a tener
el horario libre. Al final, exactamente 1 cita con `source: AUTO_FOLLOWUP`
existía en toda la base. Ambos tenants QA borrados al terminar
(`prisma/qa-auto-followup-cleanup.ts`, cascade confirmado).

**Deliberadamente NO verificado en esta sesión**: `updateAppointmentStatusAction`
en sí nunca se invocó por HTTP real (requiere sesión de Auth.js). Con esto
quedan 7 de los 8 módulos de nicho del roadmap resueltos — el único
pendiente es línea de tiempo de fotos (estética), que depende de agregar un
servicio de almacenamiento de archivos real al proyecto (hoy no tiene
ninguno — ver el stopgap de base64 en `profileImage.ts`, marcado en su
propio comentario como no apto para este caso).

## Línea de tiempo de fotos (estética)

✅ hecho, con una limitación real documentada abajo. Octavo y último módulo
de nicho de los 8 del roadmap.

**Decisión de infraestructura confirmada explícitamente antes de
implementar**: Vercel Blob, elegido por Jonta entre las opciones ofrecidas
(encaja natural con el resto del proyecto — ya usa Vercel Cron y el deploy
está previsto ahí). Dependencia nueva `@vercel/blob` (`^2.7.0`).

Modelo nuevo `ClientPhoto` (tenantId, clientId, `url`, `caption` opcional,
`takenAt`, createdByUserId). Solo guarda la URL — el archivo en sí vive en
Vercel Blob, NO en esta base de datos, a diferencia del stopgap base64 que
usa `User.image` para la foto de perfil. `src/lib/profileImage.ts` ya
advertía en su propio comentario que ese stopgap "vale para una foto de
perfil chica" y que un caso con más fotos necesitaría "un servicio de blobs
real" — este módulo es exactamente ese caso (un cliente puede tener muchas
fotos a lo largo del tiempo), así que no lo reutiliza. `src/lib/clientPhotos.ts`
replica el mismo patrón de constantes de validación
(`MAX_CLIENT_PHOTO_BYTES`/`ALLOWED_CLIENT_PHOTO_TYPES`, 5MB, JPG/PNG/WEBP)
que ya usa `profileImage.ts`.

`uploadClientPhotoAction` (`clients/actions.ts`) valida el archivo (mismo
doble chequeo cliente+servidor que ya usa la foto de perfil —
`ClientPhotoUploadForm.tsx` nuevo, calcado de
`account/ProfilePhotoUploadForm.tsx`) y llama a `put()` de `@vercel/blob`
con `access: "public"` y `addRandomSuffix: true`. Si `BLOB_READ_WRITE_TOKEN`
no está configurado, `put()` tira — se atrapa con un mensaje claro ("el
almacenamiento de archivos no está configurado todavía") en vez de un error
500 genérico, mismo criterio que el resto de integraciones externas de este
proyecto (WhatsApp, Resend) ante credenciales faltantes. Variable nueva
documentada en `.env.example` (junto con las plantillas de WhatsApp de las
fases anteriores de esta sesión, que tampoco estaban documentadas ahí
todavía — se agregaron de paso).

Gating: nuevo módulo `"photos"` en `PlanModule`, mismo tier que Paquetes/
Lista de espera (PREMIUM y PRO) — a diferencia de Recetas, subir fotos tiene
un costo real de almacenamiento, así que sí es un upsell operativo, no el
diferenciador central de un nicho. `requirePhotosAccess` sin split de
manage-access, mismo criterio que Lista de espera.

UI: sección "Línea de tiempo de fotos" embebida en
`clients/[clientId]/page.tsx` (mismo placement client-scoped que Paquetes/
Lista de espera/Recetas), grilla de miniaturas con `<img>` plano (no
`next/image`, que exigiría agregar el dominio de Vercel Blob a
`next.config.mjs` — evitado a propósito para no acoplar la config global a
un dominio que todavía no existe hasta que se cree el Blob store real).

**Verificado — capa de datos únicamente, en vivo contra la base real de
Neon**: `prisma/qa-client-photos.ts` sembró un tenant PREMIUM con una foto
(URL de ejemplo, sin subir nada real a Vercel Blob) y
confirmó: `planIncludesModule` da `true` en PREMIUM y `false` en
INDIVIDUAL/BASICO; la query de la página encuentra la foto scoped por
tenant+cliente; forzar un `tenantId` incorrecto en esa misma query no la
encuentra. Tenant QA borrado al terminar
(`prisma/qa-client-photos-cleanup.ts`, cascade confirmado). `tsc --noEmit`
limpio con la dependencia real `@vercel/blob` instalada y usada (no un
mock) — confirma que la llamada a `put()` está tipada correctamente contra
el SDK real.

**Lo que NO se pudo verificar en esta sesión, honestamente, y por qué**:
este proyecto no tiene una cuenta de Vercel Blob creada — `BLOB_READ_WRITE_TOKEN`
no existe en `.env`. A diferencia de TODOS los demás módulos de esta sesión
(donde siempre hubo una base de datos real contra la cual probar, aunque
fuera sin sesión HTTP), acá no hay ningún servicio real disponible para
ejercitar — ni siquiera parcialmente. `uploadClientPhotoAction` nunca se
llamó ni una vez, real o simulado; no hay confirmación de que `put()` con
estos parámetros exactos funcione contra la API real de Vercel Blob (el
tipado y la forma de la llamada están verificados contra el paquete
instalado, no su comportamiento en runtime). **Antes de dar este módulo por
terminado de verdad hace falta**: crear un Blob store en el dashboard de
Vercel, cargar `BLOB_READ_WRITE_TOKEN` en `.env`, y subir una foto real por
la UI para confirmar que `blob.url` queda guardada y la imagen carga en la
grilla. Fuera de esta fase además: borrar una foto ya subida (ni de la base
ni de Blob — nunca se implementó ningún delete), reordenar/destacar una
foto como "antes/después" par, y comprimir/redimensionar la imagen antes de
subir (hoy se sube tal cual la eligió el usuario, hasta 5MB).

Con esto, los 8 módulos de nicho del roadmap de producto quedan resueltos
en el código — 7 verificados en vivo contra datos reales, 1 (este) sin
verificar contra el servicio externo real por no tener la cuenta creada
todavía.

## Deploy a producción (Vercel) — primera vez

✅ hecho y verificado en vivo. El proyecto nunca había estado vinculado a
Vercel (sin `.vercel/`, sin remoto de git) — primer deploy real de
`plataforma-agenda`.

**URL de producción**: `https://plataforma-agenda.vercel.app` (dominio
gratuito de Vercel — sin dominio propio configurado todavía). Proyecto
`rime2/plataforma-agenda` en la cuenta de Vercel de Jonta
(`nankuphoto-7399`). Deploy hecho por CLI directo (`vercel deploy --prod`),
sin conectar un repositorio de GitHub — decisión explícita para arrancar
rápido; implica que no hay auto-deploy en cada push, cada deploy nuevo
requiere correr el comando a mano (o conectar Git más adelante).

**Base de datos**: se usa la misma base de Neon que ya usaba desarrollo
(decisión explícita, no una separada) — ya tenía todas las migraciones al
día, así que no hizo falta ningún paso de migración aparte para el deploy.
Confirmado en vivo que `/api/health` en producción responde
`{"status":"ok","db":"connected"}`. Implica que el tenant demo
(`consultorio-demo`, login `owner@demo.com`) y su agenda pública de
reservas ya son alcanzables en la URL real de producción, no solo en local.

**Bug real encontrado y corregido durante el primer intento de deploy**: el
build falló en Vercel (`PrismaClientInitializationError`) aunque compilaba
limpio en local — motivo conocido de Prisma: Vercel cachea `node_modules`
entre builds, así que el postinstall que genera el Prisma Client no corre
si se restaura desde caché, dejando un cliente desactualizado/ausente en
runtime. Fix estándar de Prisma: se agregó `"postinstall": "prisma generate"`
a `package.json` (no existía). Confirmado en vivo: sin el fix, deploy con
`readyState: "ERROR"`; con el fix, `readyState: "READY"` y el build completo
sin errores.

**Cron jobs ajustados al plan Hobby (gratis)**: Vercel Hobby solo permite
cron jobs con cadencia de una vez por día — el proyecto tenía
`send-reminders` corriendo cada hora (`0 * * * *`), pensado para procesar
recordatorios de cita dentro de la hora en que vencen. Cambiado a
`0 5 * * *` (una corrida diaria, 5am). Decisión de producto aceptada
explícitamente por Jonta al elegir el plan Hobby: los recordatorios de cita
pierden precisión horaria (se procesan una vez al día en vez de dentro de
la hora que corresponde) — si el proyecto pasa a plan Pro más adelante,
revertir a cadencia horaria en `vercel.json` para recuperar la precisión
original. Los otros 5 crons ya eran diarios, sin cambios. Confirmado en
vivo con `vercel crons ls` que los 6 quedaron registrados con la cadencia
esperada, y que `/api/cron/send-reminders` sin el header de autorización
correcto responde 401 (el guard de `CRON_SECRET` sigue funcionando en
producción, no solo en local).

**Variables de entorno**: las 23 variables no vacías de `.env` local se
cargaron a Vercel (entorno Production) vía `vercel env add` con el valor
por stdin — nunca se imprimió ningún valor en la salida de ningún comando
(aprendido de un incidente real en esta misma sesión: un `sed` mal armado
al chequear el modo de `STRIPE_SECRET_KEY` imprimió la llave completa en la
conversación; Jonta la rotó al toque). `RESEND_API_KEY` se saltó (vacía
también en local — sigue sin configurar, el envío de emails de "olvidé mi
contraseña" sigue fallando en silencio en producción igual que en local).
`NEXT_PUBLIC_APP_URL` se seteó aparte, después de conocer la URL real
asignada por Vercel (es una variable `NEXT_PUBLIC_` — se inyecta al bundle
en build time, no en runtime, así que hizo falta un segundo
`vercel deploy --prod` después de cargarla para que quedara horneada
correctamente).

**Verificado en vivo contra la URL real de producción** (no localhost):
`/api/health` → `200 {"status":"ok","db":"connected"}`; `/login` → `200`;
`/consultorio-demo` (agenda pública del tenant demo) → `200`;
`/api/cron/send-reminders` sin `Authorization` → `401`. Los 6 cron jobs
confirmados registrados vía `vercel crons ls` con la cadencia correcta.

**Pendiente real, no de código — requiere acceso a paneles externos que
este entorno no tiene**:
1. **Webhooks de Stripe y Wompi** siguen apuntando a donde estuvieran
   configurados antes (probablemente `stripe listen` local o ninguno real
   todavía) — hay que registrar los endpoints de producción
   (`https://plataforma-agenda.vercel.app/api/webhooks/stripe` y
   `/api/webhooks/wompi`) en sus paneles respectivos. Si se crea un webhook
   *nuevo* en Stripe, su signing secret es distinto al que ya está cargado
   en Vercel (`STRIPE_WEBHOOK_SECRET`) — hay que actualizarlo con
   `vercel env add STRIPE_WEBHOOK_SECRET production --force` si cambia.
2. **RESEND_API_KEY** sigue sin configurar — crear la cuenta de Resend y
   cargar la key (mismo pendiente que ya existía en local, ver la fase de
   "Recuperación y cambio de contraseña" más arriba en este archivo).
3. **Plantillas de WhatsApp** (`recordatorio_cita`, `seguimiento_recompra`,
   `alerta_stock_bajo`, `alerta_paquete_vencimiento`, `cupo_lista_espera`)
   siguen sin aprobación de Meta — ya documentado en fases anteriores, no
   es nuevo de este deploy.
4. **Sin dominio propio** — la URL sigue siendo `*.vercel.app`; conectar un
   dominio real es un paso aparte en el dashboard de Vercel (Settings →
   Domains) cuando Jonta tenga uno listo.
5. **Sin repo de Git conectado** — cada deploy nuevo requiere correr
   `vercel deploy --prod` a mano desde esta carpeta; no hay auto-deploy en
   cada push todavía.

## Identidad visual: dirección "Booksy" reemplazó a "cronógrafo" (verde pino → turquesa)

No estaba documentado acá — solo como comentarios sueltos en
`tailwind.config.ts`/`src/app/layout.tsx`, lo que causó confusión real en
una sesión de Claude Code (11 ago 2026) que asumió por error que el verde
pino seguía vigente. Registrado ahora para que no vuelva a pasar.

**Estado actual (el correcto, no lo cambies sin pedido explícito):**
paleta turquesa-petróleo (`pine.DEFAULT #1E7F95`, `pine.dark #145D6E`),
tipografía Inter (`--font-sans` y `--font-display` apuntan a la misma
variable, sin serif aparte), íconos Lucide sin modificar. Los NOMBRES de
los tokens de Tailwind (`ink`, `paper`, `pine`, `sage`, `berry`, `gold`,
`case`) se mantuvieron iguales a propósito a través del cambio de paleta
— todo el código que ya usa `bg-pine`/`text-ink`/etc. hereda el look
nuevo sin tocar archivo por archivo. Ver los comentarios en
`tailwind.config.ts` y `src/app/layout.tsx` para el detalle campo por
campo.

**Por qué existe esta nota:** en la carpeta hermana `design_handoff_rime_app`
viven los prototipos `.dc.html` originales (`RIME Escritorio.dc.html`, etc.)
con la identidad *anterior* — verde pino `#2F5D50`, Fraunces + Plus Jakarta
Sans. Son solo mockups de diseño, no reflejan el estado actual de esta app.
Si alguna vez se pide "que la plataforma se vea como los mockups de RIME",
la respuesta correcta es actualizar ESE color/tipografía en los mockups
para que coincidan con lo que ya está en producción acá — no al revés.

## Verificación de gating por plan y facturación — sesión de Claude Code (11 ago 2026)

Motivada por descubrir que la nota de "Qué falta por decidir" (más arriba)
estaba desactualizada: decía que faltaba implementar feature-gating y
facturación, cuando en realidad ya estaban construidos — solo nunca se
habían probado de punta a punta (el seed solo tenía un tenant PREMIUM, que
ve todo habilitado).

**Gating por plan — verificado, 20/20 chequeos.** Nuevo script
`prisma/seed-test-plans.ts` (`npm run db:seed:test-plans`, re-ejecutable
con `upsert`) crea tenants mínimos en los 3 planes que el seed principal no
cubre: `test-individual` (`owner@test-individual.com`), `test-basico`
(`owner@test-basico.com`), `test-pro` (`owner@test-pro.com`) — contraseña
`demo1234` igual que el resto. Con Playwright contra un build de
producción local, se confirmó que Reportes/Inventario/Gift
cards/Marketing respetan `PLAN_LIMITS` exactamente (bloqueados en
INDIVIDUAL/BASICO según corresponda, abiertos en PREMIUM/PRO), Reseñas
queda abierto en todos los planes (gating por rol, no por plan — así está
diseñado). Los topes de sede/profesional (`hasReachedLocationLimit`/
`hasReachedProfessionalLimit`) también se probaron reales contra
`test-individual` (cap=1 en ambos): el primero entra, el segundo se
bloquea con el mensaje esperado.

**Facturación Stripe — verificada con datos reales, no simulados.**
Completado un checkout real en modo test (tarjeta 4242 4242 4242 4242)
para `test-individual`. Como no hay un túnel hacia este servidor local
(el Stripe CLI tenía la sesión de login vencida — pediría `stripe login`
interactivo), los eventos reales que generó Stripe
(`checkout.session.completed`, luego `customer.subscription.updated` al
cambiar de plan) se tomaron con `stripe.events.list()` y se entregaron a
mano a `/api/webhooks/stripe`, firmados con `stripe.webhooks
.generateTestHeaderString()` usando el mismo `STRIPE_WEBHOOK_SECRET` de
`.env` — mismo código de verificación de firma que corre en producción,
solo sin depender de que Stripe pueda alcanzar `localhost`. Confirmado en
la base de datos: `Tenant.status` pasó de `TRIAL` a `ACTIVE` con el
`stripeSubscriptionId` real guardado tras el primer evento, y
`Tenant.plan` pasó de `INDIVIDUAL` a `BASICO` tras cambiar de plan y
entregar el segundo evento.

**Corrección a la nota "pendiente" de arriba (11 ago 2026, más tarde el
mismo día):** al escribir esa nota no se revisó el resto de `CLAUDE.md` —
los flujos de Wompi (cambiar de plan, cancelar, reactivar) y
`customer.subscription.deleted` de Stripe ya estaban ✅ hechos y
verificados en vivo desde una sesión anterior (Cowork, 6 ago 2026, ver
sección "Reactivación de cuenta tras `CANCELLED`" más arriba). El único
gap real que quedaba era `invoice.payment_failed`, nunca disparado en
vivo hasta ahora.

**Cierre de ese gap (11 ago 2026, misma sesión que la corrección de
arriba)**: se disparó un cobro real fallido sobre la suscripción viva de
`test-individual`. El Billing Portal de Stripe (`billing.stripe.com`)
resultó no automatizable con Playwright en modo headless — el botón
"Add"/"Guardar" nunca completaba el submit, aparentemente bloqueado por
la protección anti-bot (hCaptcha invisible) del Portal; no vale la pena
insistir ahí para este tipo de verificación. En su lugar se usó un
Checkout Session real en `mode: "setup"` (mismo dominio
`checkout.stripe.com` que ya se sabía automatizable de sesiones
anteriores) para guardar la tarjeta de prueba 4000 0000 0000 0341 (se
guarda bien, rechaza al cobrar) como método de pago del customer. Nota
técnica: la API de PaymentMethods/Tokens rechaza números de tarjeta
crudos server-side en este modo de cuenta ("raw card data APIs"
deshabilitado) — por eso hizo falta el Checkout hospedado en vez de
crearla directo con el SDK. Para forzar el cobro se creó un
`invoiceItem` pendiente + `invoices.create`/`finalizeInvoice` sobre esa
misma suscripción (con `default_payment_method` de la suscripción
apuntando a la tarjeta de rechazo) — la propia API de Stripe respondió
`card_declined` al finalizar. El evento real `invoice.payment_failed`
resultante se tomó con `stripe.events.list()` y se entregó a mano al
webhook local, mismo patrón de firma real que las demás verificaciones
de esta sección. Confirmado en la base de datos: `Tenant.status` pasó de
`ACTIVE` a `PAST_DUE`. Confirmado además en navegador real que el
bloqueo funciona con este estado específico (no solo con `CANCELLED`):
entrar a `/dashboard/test-individual` redirige a `account-locked` con el
mensaje "Tu cuenta está con un pago pendiente...". Al terminar, se
restauró `test-individual` a su estado limpio: tarjeta buena
(4242 4242 4242 4242) de nuevo como `default_payment_method` de la
suscripción y del customer, tarjeta de rechazo desasociada, factura de
prueba anulada (`voidInvoice`), `Tenant.status` de vuelta a `ACTIVE`.

Con esto, los tres proveedores/eventos de facturación del SaaS
(Stripe: checkout, cambio de plan, `invoice.payment_failed`,
`customer.subscription.deleted`; Wompi: setup, cambio de plan, cancelar,
reactivar) quedan verificados en vivo de punta a punta — no queda ningún
flujo de facturación conocido sin probar contra las APIs reales.

**Bug real encontrado y corregido en el camino** (no relacionado a lo de
arriba — apareció mientras se probaban los topes de capacidad): el
callback `jwt` de `src/lib/auth.ts` reconsulta `passwordChangedAt` contra
la base en cada `auth()` (necesario para poder invalidar el token si la
contraseña cambió en otro dispositivo). Si esa consulta puntual falla por
un hipo transitorio de conexión con Neon — se vio pasar en vivo durante
esta sesión (`Error in PostgreSQL connection: Closed`) — Auth.js
interpretaba el error como sesión inválida y deslogueaba al usuario sin
aviso, en medio de cualquier acción. Ahora ese caso falla en modo abierto
(conserva la sesión existente) en vez de cerrado. Ver el comentario en el
callback `jwt` para el razonamiento completo del trade-off.

**De paso, optimización de performance:** `src/app/dashboard/[tenantSlug]/layout.tsx`
y el guard `requireDashboardAccess` (`src/lib/auth-guards.ts`) hacían cada
uno su propio `auth()` + `prisma.tenant.findUnique` — el mismo roundtrip a
la base duplicado en cada navegación del dashboard. Unificado en
`getSessionAndTenant()`, envuelto en `React.cache()` para que ambos
compartan la misma consulta dentro del mismo request. Medido: ~20-25% más
rápido en las páginas simples (Clientes, Inventario, Servicios, Agenda) en
producción local.
