# Fase 5 (parte 2/2): selector de sede real en agenda interna + booking público

Esta es la SEGUNDA y última parte del bloque "multi-sede avanzado" de la
Fase 5 (ver `CLAUDE.md`). La parte 1 ya construyó `ProfessionalLocation` (qué
profesional atiende en qué sede) y la gestión de sedes en
`/dashboard/[tenantSlug]/locations/`. Esta parte conecta eso con los dos
flujos que hoy siguen hardcodeados a una sola sede:

- `src/app/dashboard/[tenantSlug]/page.tsx` (agenda interna): usa
  `const location = tenant.locations[0];`.
- `src/app/(public)/[tenantSlug]/page.tsx` y
  `src/app/(public)/[tenantSlug]/actions.ts` (booking público): usan
  `tenant.locations[0]` / `prisma.location.findFirst({ where: { tenantId } })`.

No hace falta ninguna migración de base de datos en esta parte — todo el
código de esta fase es sobre el schema que ya existe.

## Regla general: si el tenant tiene 1 sola sede, todo se ve exactamente
## igual que hoy

En ambos flujos (interno y público), si el tenant tiene una sola `Location`,
NO debe aparecer ningún selector ni paso adicional — el comportamiento debe
ser indistinguible del actual. El selector de sede solo debe aparecer cuando
hay 2 o más sedes relevantes (ver detalle de "relevantes" en cada sección).

---

## 1. Agenda interna (`src/app/dashboard/[tenantSlug]/page.tsx`)

Reemplaza `const location = tenant.locations[0];` por un selector real:

- Acepta un query param `?locationId=`, con el mismo patrón ya usado para
  `?week=` en este archivo.
- "Sedes relevantes para este usuario" = las `tenant.locations` donde el
  usuario tiene acceso, usando `hasLocationAccess` (ya existe en
  `src/lib/authorization.ts`, no crees una función nueva) — un OWNER típico
  tendrá acceso a todas, pero un STAFF/PROFESSIONAL puede tener acceso a
  solo una.
- Si `locationId` viene en la URL y es una sede válida a la que el usuario
  tiene acceso, úsala. Si no viene, no es válida, o el usuario no tiene
  acceso a ella, usa la primera sede accesible (ordenada por `createdAt`
  ascendente) — nunca muestres una sede a la que el usuario no tenga acceso,
  ni con error, simplemente ignora el parámetro inválido y cae al default.
- Si el usuario tiene acceso a **2 o más** sedes, muestra un selector simple
  (un `<form method="get">` con un `<select name="locationId">` + botón,
  mismo patrón de formulario GET que ya usa el filtro de fechas en
  `reports/page.tsx` — no hace falta JS ni componente cliente). Si tiene
  acceso a **1 sola**, no muestres ningún selector.
- Al cambiar de sede está bien que la semana vuelva a la actual (no hace
  falta preservar `week` a través del cambio de sede).
- Filtra los profesionales que se pasan a `WeeklyAgenda` (prop
  `professionals: AgendaProfessional[]`): hoy se arma desde
  `tenant.professionals` (todos los del tenant). Cámbialo por una consulta
  que traiga solo los profesionales activos con una `ProfessionalLocation`
  para la sede seleccionada (`professionalLocations: { some: { locationId:
  location.id } } }`).
- El resto de la lógica (rango de la semana, `appointments` filtrados por
  `locationId: location.id`) ya usa `location.id` correctamente — solo
  cambia de dónde sale `location`.

## 2. Booking público (`src/app/(public)/[tenantSlug]/`)

### `page.tsx`

- Cambia el include de `locations: { take: 1 }` a traer todas las sedes del
  tenant (sin `take`).
- Si `tenant.locations.length > 1`, pasa la lista completa de sedes a
  `BookingWizard` (nuevo prop `locations: BookingLocation[]`, con al menos
  `id`, `name`, `timezone`). Si es 1 sola (o 0), el comportamiento es el
  mismo de hoy.
- El bloque que arma `postCheckout` (cuando se vuelve de un pago) usa hoy
  `location?.name` / `location?.timezone` del `tenant.locations[0]` —
  cámbialo para que salga de la sede real de esa cita: agrega
  `location: true` al `include` de la consulta de `appointment` en ese
  bloque, y usa `appointment.location.name` / `appointment.location.timezone`
  directamente. Esto es un fix necesario para que el estado post-pago
  muestre la sede correcta cuando hay más de una.
- Pasa a cada profesional en la prop `professionals` de `BookingWizard`
  también sus `locationIds` (array de `locationId` desde
  `professional.professionalLocations`), agregando
  `professionalLocations: { select: { locationId: true } }` al `include` de
  profesionales.

### `BookingWizard.tsx`

- Extiende el tipo `Step` para incluir `"location"` como paso inicial,
  **solo si** `locations.length > 1`. Si `locations.length <= 1`, el wizard
  arranca directo en `"service"` como hoy, usando esa única sede (o la
  ausencia de ella, mismo mensaje actual si no hay ninguna) sin mostrar
  ningún paso de sede.
- Nuevo estado `selectedLocationId` (y su timezone derivado) — reemplaza el
  prop fijo `locationTimezone` que hoy recibe el componente desde afuera;
  ahora el timezone a usar para mostrar horarios depende de la sede elegida
  en el wizard (si hay una sola sede, se autoselecciona esa y el
  comportamiento visual es idéntico al actual).
- Extiende `BookingProfessional` con `locationIds: string[]`. En el paso
  "professional", filtra por **ambos** criterios a la vez: que el
  profesional ofrezca el servicio elegido (`serviceIds`, lógica que ya
  existe) Y que esté asignado a la sede elegida (`locationIds`).
- Pasa `selectedLocationId` a `getAvailableSlotsAction` y
  `createAppointmentAction` (ver cambios de `actions.ts` abajo).

### `actions.ts`

- `getAvailableSlotsAction`: agrega un parámetro `locationId` (después de
  `tenantSlug`, antes de `professionalId` — o donde te resulte más prolijo,
  pero agrégalo). En vez de `prisma.location.findFirst({ where: { tenantId }
  })`, usa `prisma.location.findFirst({ where: { id: locationId, tenantId }
  })` — si no existe, error `"Sede no válida."`. Además, antes de generar
  los horarios, valida que el profesional esté efectivamente asignado a esa
  sede (`prisma.professionalLocation.findUnique({ where: {
  professionalId_locationId: { professionalId, locationId } } })`) — si no
  existe esa asignación, error `"El profesional seleccionado no atiende en
  esa sede."`. Nunca confíes en que el cliente mandó una combinación válida
  solo porque el wizard la filtró en el navegador.
- `createAppointmentAction`: agrega `locationId` a `CreateAppointmentInput`.
  Misma validación que en `getAvailableSlotsAction` (sede pertenece al
  tenant + profesional asignado a esa sede) antes de crear la cita. Usa ese
  `location.id` real al crear el `Appointment` (ya lo hace, solo cambia de
  dónde sale `location`).
- No toques `createCheckoutSessionAction` ni `createWompiCheckoutAction` —
  operan sobre una cita que ya tiene su `locationId` fijado desde que se
  creó, no necesitan cambios.

## Qué NO hacer en este prompt (no te salgas de esto)

- No agregues servicios específicos por sede (`Service` sigue siendo
  tenant-wide, no hay `ServiceLocation`) — el paso "servicio" del wizard no
  cambia, solo el de "profesional" se filtra por sede.
- No toques reportes.
- No toques `createCheckoutSessionAction` ni `createWompiCheckoutAction`.
- No agregues borrado de sedes ni gestión de `StaffLocationRole` (sigue
  fuera de scope, igual que en la parte 1).
- No cambies nada visible para un tenant con una sola sede — verifícalo
  explícitamente antes de terminar (ver abajo).
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
  flujo completo.

## Verificación antes de terminar

- `npx tsc --noEmit` y `npm run lint` sin errores.
- `npx vitest run` — no debería hacer falta lógica pura nueva no testeada,
  pero si agregas alguna función pura, dale su test.
- Prueba manual 1: con el tenant demo que ya tiene 2 sedes (Sede Principal /
  Sede Norte), confirma que la agenda interna muestra el selector, que
  cambiar de sede efectivamente cambia las citas y profesionales mostrados,
  y que el booking público muestra el paso de elegir sede y filtra
  profesionales según corresponda.
- Prueba manual 2 (regresión, importante): confirma que un tenant con una
  sola sede sigue viendo la agenda interna y el booking público exactamente
  como antes, sin ningún selector visible.
