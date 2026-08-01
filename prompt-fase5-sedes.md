# Fase 5 (parte 1/2): gestión de sedes + asignación de profesionales por sede

Este prompt es la PRIMERA de dos partes del bloque "multi-sede avanzado" de la
Fase 5 (ver `CLAUDE.md`). Esta parte solo construye los cimientos de datos y
la administración de sedes. La segunda parte (que vendrá en un prompt aparte,
después de que esta esté verificada) conectará esto con la agenda interna y
la página pública de reservas, que hoy están *hardcodeadas* a una sola sede
(`tenant.locations[0]` en `src/app/dashboard/[tenantSlug]/page.tsx` y
`prisma.location.findFirst(...)` en `src/app/(public)/[tenantSlug]/page.tsx`
y `src/app/(public)/[tenantSlug]/actions.ts`). **No toques esos archivos en
este prompt** — la parte 2 se encarga de eso.

## Por qué hace falta esto

Hoy no existe ninguna forma de crear una segunda sede desde la UI (no hay
página de gestión de sedes), y tampoco existe ninguna relación explícita
entre `Professional` y `Location` — un profesional pertenece al tenant
entero, no a una sede en particular. Sin resolver esto primero, no tiene
sentido agregar un selector de sede en la agenda o el booking público: no
habría manera de tener una segunda sede con profesionales propios que
probar.

## 1. Cambios de schema (`prisma/schema.prisma`)

Agrega un modelo nuevo, espejo de `ProfessionalService` que ya existe:

```prisma
model ProfessionalLocation {
  professionalId String
  professional   Professional @relation(fields: [professionalId], references: [id], onDelete: Cascade)
  locationId     String
  location       Location     @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@id([professionalId, locationId])
}
```

Agrega la relación inversa `professionalLocations ProfessionalLocation[]` en
`Professional` y en `Location`.

Reglas de negocio para esta relación (no son obvias, síguelas tal cual):

- Un profesional puede estar asignado a 0, 1 o varias sedes del mismo tenant
  — no es una relación exclusiva.
- Al crear una sede nueva, **no** se asigna ningún profesional
  automáticamente. La asignación siempre es manual, vía la UI descrita más
  abajo.
- No agregues borrado de sedes en esta fase (una sede con citas existentes
  quedaría con `Appointment.locationId` huérfano si se borra — fuera de
  scope, ver exclusiones).

## 2. Migración de datos retroactiva (crítico, no lo improvises)

Como ya existen tenants con profesionales y citas reales (datos de prueba
verificados en fases anteriores), al agregar `ProfessionalLocation` hace
falta un backfill para que ningún profesional quede "huérfano" de sede
(lo que rompería el booking público en la parte 2, que va a filtrar
profesionales por sede). Genera la migración con
`npx prisma migrate dev --name add_professional_location` (recuerda: para el
problema de bloqueo de archivos en Windows, primero detén `npm run dev` y
Prisma Studio si están corriendo, y vuelve a levantar `npm run dev` después),
y luego **edita el archivo `migration.sql` generado** para agregar, al final,
este backfill en SQL puro (ajusta comillas/nombres si Prisma generó algo
distinto, pero la lógica debe ser exactamente esta):

```sql
-- Backfill: cada profesional queda asignado a toda sede donde ya tenga
-- al menos una cita.
INSERT INTO "ProfessionalLocation" ("professionalId", "locationId")
SELECT DISTINCT a."professionalId", a."locationId"
FROM "Appointment" a
ON CONFLICT DO NOTHING;

-- Backfill: un profesional sin ninguna cita todavía queda asignado a la
-- sede más antigua de su tenant (si el tenant ya tiene alguna sede).
INSERT INTO "ProfessionalLocation" ("professionalId", "locationId")
SELECT p.id, (
  SELECT l.id FROM "Location" l
  WHERE l."tenantId" = p."tenantId"
  ORDER BY l."createdAt" ASC
  LIMIT 1
)
FROM "Professional" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProfessionalLocation" pl WHERE pl."professionalId" = p.id
)
AND EXISTS (
  SELECT 1 FROM "Location" l WHERE l."tenantId" = p."tenantId"
);
```

Después de correr la migración, verifica con Prisma Studio (o una query
directa) que el tenant demo (`consultorio-demo` o como se llame en el seed)
tiene su(s) profesional(es) correctamente asignado(s) a su sede existente.

## 3. Autorización: gestionar sedes es solo para OWNER

Agrega en `src/lib/auth-guards.ts` un nuevo guard `requireOwnerAccess`,
análogo a `requireReportsAccess` mirando el código existente, pero con
`allowedRoles: ["OWNER"]` en vez de `["OWNER", "ADMIN"]` — reutiliza
`hasAnyOfRolesInTenantLocations` que ya existe en `src/lib/authorization.ts`,
no crees una función de autorización nueva. 404 (no 403) si no tiene acceso,
igual que el patrón existente.

## 4. Páginas nuevas

Todas bajo `src/app/dashboard/[tenantSlug]/locations/`, protegidas con
`requireOwnerAccess`:

- `page.tsx` — lista las sedes del tenant (nombre, dirección, timezone,
  cantidad de profesionales asignados). Link "+ Nueva sede" y, por cada
  sede, link a su página de edición.
- `new/page.tsx` — formulario para crear una sede: `name` (obligatorio),
  `address` (opcional), `timezone` (texto libre, formato IANA tipo
  "America/Bogota", con valor por defecto "America/Santiago" — no valides
  contra una lista fija, mantenlo tan permisivo como ya es hoy el campo en
  el seed).
- `[locationId]/page.tsx` — formulario para editar nombre/dirección/timezone
  de esa sede, y debajo un checklist con **todos** los profesionales activos
  del tenant (`Professional.active: true`), cada uno con un checkbox
  marcado si ya está asignado a esta sede (`ProfessionalLocation`
  existente). Un botón "Guardar" que actualiza tanto los datos de la sede
  como las asignaciones de profesionales en un solo submit.
- `actions.ts` — server actions:
  - `createLocationAction`: valida `tenantId` vía `requireOwnerAccess`,
    crea la `Location`.
  - `updateLocationAction`: valida que la sede pertenece al tenant
    (`findFirst({ where: { id, tenantId } })`, nunca confiar en el `id` de
    la URL solo), actualiza nombre/dirección/timezone.
  - `updateLocationProfessionalsAction`: recibe la lista de
    `professionalId` marcados en el checklist; dentro de una transacción,
    borra las `ProfessionalLocation` de esa sede que ya no estén marcadas y
    crea las nuevas que falten (un "set-replace" completo, no un diff
    manual complicado). Valida que cada `professionalId` pertenezca al
    mismo tenant antes de crear la relación.

## 5. Link en el dashboard

En `src/app/dashboard/[tenantSlug]/page.tsx`, agrega un link "Sedes" junto
al de "Reportes" que ya existe, visible **solo si** el usuario tiene acceso
de OWNER (mismo patrón que el link de "Reportes", pero con el check de
`requireOwnerAccess`/rol OWNER en vez de OWNER+ADMIN). No cambies nada más
de ese archivo — el selector de sede real es la parte 2.

## Qué NO hacer en este prompt (no te salgas de esto)

- No toques `src/app/dashboard/[tenantSlug]/page.tsx` más allá del link
  "Sedes" descrito arriba (nada de selector de sede todavía).
- No toques `src/app/(public)/[tenantSlug]/page.tsx` ni
  `src/app/(public)/[tenantSlug]/actions.ts` ni `BookingWizard.tsx`.
- No agregues borrado de sedes.
- No agregues gestión de `StaffLocationRole` (invitar usuarios, asignar
  ADMIN/STAFF/PROFESSIONAL a una sede) — es un tema aparte de "gestión de
  equipo", no pedido acá.
- No toques reportes — siguen agregando todas las sedes del tenant juntas.
- No agregues validación de formato de timezone contra una librería o lista.
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
  flujo completo.

## Verificación antes de terminar

- `npx tsc --noEmit` sin errores.
- `npm run lint` sin errores nuevos.
- Prueba manual: como OWNER, crear una segunda sede, asignarle un
  profesional existente (o uno nuevo), y confirmar en Prisma Studio que la
  fila en `ProfessionalLocation` quedó bien creada.
