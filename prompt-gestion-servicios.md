# Prompt: Gestión de servicios (crear/editar)

## Contexto

`model Service` (`prisma/schema.prisma`) existe desde el scaffolding inicial
(`name`, `durationMinutes`, `price` — Decimal(10,2), sin moneda propia,
`active`) y ya se usa en todo el proyecto: el checklist de servicios en
`professionals/new` y `professionals/[professionalId]`, la agenda pública de
reservas (`src/app/(public)/[tenantSlug]/page.tsx`, que ya filtra
`active: true`), y reportes/comisiones. Pero hoy NO existe ninguna pantalla
para crear o editar un `Service` — el único lugar donde se crean es
`prisma/seed.ts`. Esta fase agrega esa pantalla. **No hace falta ninguna
migración de Prisma** — el modelo ya tiene todo lo necesario.

Nota importante sobre `price`: no tiene moneda propia — es un número
canónico que hoy se interpreta como USD para Stripe y se convierte con un
tipo de cambio mockeado (`MOCK_USD_TO_COP_RATE`, en
`src/app/(public)/[tenantSlug]/actions.ts`) para Wompi/COP. Esta fase NO
toca esa lógica de checkout ni agrega selector de moneda — el campo `price`
en el formulario de servicio es un solo número, igual que hoy.

Mirá `src/app/dashboard/[tenantSlug]/professionals/` y
`src/app/dashboard/[tenantSlug]/locations/` como referencia directa de
patrón — esta fase es casi un calco de esas dos (lista + `new/` + `[id]/`,
guard OWNER/ADMIN, nunca borrado real, solo `active`).

## Qué hacer

### 1. Guard nuevo en `src/lib/auth-guards.ts`

`requireServicesManageAccess(tenantSlug)` — mismo patrón exacto que
`requireProfessionalsManageAccess`: pasa por `requireDashboardAccess`, exige
rol OWNER o ADMIN (`hasAnyOfRolesInTenantLocations(..., ["OWNER", "ADMIN"])`),
404 si no. Sin chequeo de plan/módulo — gestionar el catálogo de servicios es
función core de todos los planes, igual que profesionales.

### 2. Páginas y acciones, calcadas del patrón de `professionals/`

`src/app/dashboard/[tenantSlug]/services/page.tsx` — lista de servicios del
tenant (todos, activos e inactivos, con algo que distinga visualmente los
inactivos — un badge "Inactivo" alcanza, mismo criterio visual que ya usa el
proyecto en otros lados), con link "+ Nuevo servicio" y link a cada fila para
editar. Guard: `requireServicesManageAccess`.

`src/app/dashboard/[tenantSlug]/services/new/page.tsx` + `services/actions.ts`
función `createServiceAction(tenantSlug, formData)` — form con `name`
(texto), `durationMinutes` (número entero, minutos), `price` (número
decimal), `active` (checkbox, default marcado). Validación:
- `name` obligatorio.
- `durationMinutes` entero positivo (> 0) — sin tope máximo.
- `price` número >= 0 (podés tener servicios gratuitos, ej. una primera
  consulta de cortesía — no lo bloquees).
Si algo falla, redirige a `new?error=...` con el mensaje, mismo patrón que
`createProfessionalAction`.

`src/app/dashboard/[tenantSlug]/services/[serviceId]/page.tsx` +
`updateServiceAction(tenantSlug, serviceId, formData)` — mismo form
precargado con los valores actuales, misma validación. Filtrá por `tenantId`
además del id al buscar el servicio (no confiar en el id de la URL solo,
mismo criterio que el resto del proyecto). 404 si no pertenece al tenant.
Redirige a `[serviceId]?saved=1` si guarda bien.

**No agregues borrado real de servicios** — mismo criterio que
Profesionales/Sedes/Inventario: solo se desactivan (`active: false`), nunca
se eliminan de la base. Desactivar un servicio no debe tocar ninguna fila de
`ProfessionalService` existente ni cancelar citas ya agendadas con ese
servicio — el filtro `active: true` que ya existe en todos los lugares donde
se lista/selecciona un servicio (booking público, checklist de
profesionales) ya se encarga de que un servicio inactivo deje de ofrecerse
para citas NUEVAS, sin que tengas que tocar esos archivos.

### 3. Nav

Agregá `{ href: `/dashboard/${tenantSlug}/services`, label: "Servicios",
show: hasReportsAccess }` al array `navItems` de
`src/app/dashboard/[tenantSlug]/layout.tsx` — reusá la misma variable
`hasReportsAccess` que ya existe ahí (representa "OWNER o ADMIN", el mismo
criterio que Profesionales/Reportes/Equipo, aunque el nombre de la variable
diga "Reports").

## Qué NO hacer

- No agregues ninguna migración de Prisma — `Service` ya tiene todos los
  campos que hacen falta.
- No agregues selector de moneda ni toques
  `src/app/(public)/[tenantSlug]/actions.ts`, `src/lib/stripe.ts`,
  `src/lib/wompi.ts`, ni ningún webhook — la interpretación de `price` como
  número canónico sin moneda propia queda igual que hoy.
- No agregues borrado real de servicios, solo `active`.
- No toques `professionals/actions.ts`, `professionals/new/page.tsx`, ni
  `professionals/[professionalId]/page.tsx` — el checklist de servicios ahí
  ya lee `prisma.service.findMany(...)` en vivo, así que un servicio nuevo
  va a aparecer solo, sin cambios en esos archivos.
- No agregues vínculo servicio↔insumo de inventario ni descuento automático
  de stock — es una fase aparte, todavía sin planear.
- No toques `CLAUDE.md` — de eso me encargo yo.

## Verificación

1. Creá un servicio de prueba nuevo (nombre, duración, precio) y confirmá
   que aparece en la lista de Servicios y, sin recargar nada más, en el
   checklist de un profesional al abrir `professionals/new` o la ficha de un
   profesional existente.
2. Confirmá que aparece también en la agenda pública de reservas
   (`/book/<slug>` o como esté montada la ruta pública) como una opción de
   servicio seleccionable.
3. Editalo (cambiá precio y duración) y confirmá que el cambio se refleja en
   esos mismos lugares.
4. Desactivalo y confirmá que YA NO aparece como opción en la agenda pública
   de reservas ni en el checklist de un profesional al crear uno nuevo, pero
   que un profesional que ya lo tenía asignado (`ProfessionalService`
   existente) no pierde esa fila en la base (el checkbox marcado deja de
   listarse porque el query ya filtra por `active: true`, pero la fila
   subyacente sigue ahí — confirmalo en Prisma Studio, no rompiste nada).
5. Probá que un usuario con rol STAFF (sin OWNER/ADMIN) no puede acceder a
   `/dashboard/<tenantSlug>/services` (404, no 403).
6. Confirmá que los tests existentes siguen pasando y que nada del booking
   público, profesionales, o reportes cambió de comportamiento fuera de lo
   agregado acá.

Contame qué verificaste en vivo, no solo qué escribiste.
