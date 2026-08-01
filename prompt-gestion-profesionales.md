# Gestión de profesionales (Categoría 1: bloqueador de uso real)

Hoy `Professional` solo se crea vía `prisma/seed.ts` — no existe ninguna
pantalla para crear, editar, activar/desactivar un profesional, ni para
asignarle sedes o servicios desde su propia ficha. Esto bloquea a cualquier
negocio con más de un profesional: no pueden sumar gente a su cuenta sin
que alguien edite la base de datos a mano.

No hace falta ninguna migración de Prisma — `Professional`,
`ProfessionalService` y `ProfessionalLocation` ya existen tal cual se
necesitan. Esta fase es 100% código de aplicación.

## Qué hacer

### 1. Tope de profesionales activos por plan

En `src/lib/planLimits.ts`: agrega `maxProfessionals: number | null` a la
interfaz `PlanLimits` y a cada entrada de `PLAN_LIMITS`:

```ts
INDIVIDUAL: { maxLocations: 1, maxProfessionals: 1, modules: {...} },
BASICO:     { maxLocations: 1, maxProfessionals: 3, modules: {...} },
PREMIUM:    { maxLocations: 3, maxProfessionals: 8, modules: {...} },
PRO:        { maxLocations: null, maxProfessionals: null, modules: {...} },
```

Agrega también `hasReachedProfessionalLimit(plan: Plan, currentActiveCount:
number): boolean`, mismo patrón exacto que `hasReachedLocationLimit`
(`null` = sin límite). Súmale tests en `planLimits.test.ts` igual de
completos que los que ya existen para sedes.

**Regla de negocio del tope** (importante, no es solo "bloquear si ya hay
muchos profesionales"): el tope aplica sobre profesionales con
`active: true`. Crear o editar un profesional dejándolo **inactivo** nunca
debe bloquearse por el tope, sin importar cuántos activos haya. Solo se
bloquea el guardado si el resultado dejaría al tenant con más profesionales
activos que su límite:

- Al **crear**: si el formulario llega con "Activo" marcado, cuenta los
  profesionales activos actuales del tenant y bloquea si
  `hasReachedProfessionalLimit(tenant.plan, currentActiveCount)`.
- Al **editar**: si el formulario deja al profesional en `active: true`
  (ya sea porque ya lo estaba y sigue, o porque pasa de inactivo a activo),
  cuenta los profesionales activos del tenant **excluyendo al que se está
  editando** y aplica el mismo chequeo. Si el profesional queda `active:
  false`, nunca bloquear.

Mensaje de error sugerido:
`"Tu plan (X) permite hasta N profesional(es) activo(s). Desactiva otro
profesional o sube de plan."`

### 2. Guard de acceso

En `src/lib/auth-guards.ts`: nuevo `requireProfessionalsManageAccess(tenantSlug)`
— llama a `requireDashboardAccess` y exige rol OWNER o ADMIN (mismo
criterio que `requireReportsAccess`/`requireInventoryManageAccess`, 404 en
vez de 403). No necesita chequeo de plan/módulo — gestionar profesionales
es una función core de todos los planes, solo cambia el tope numérico.

### 3. Páginas

`src/app/dashboard/[tenantSlug]/professionals/page.tsx` — lista de
profesionales del tenant (nombre, activo/inactivo, comisión, cantidad de
sedes y servicios asignados), con link "+ Nuevo profesional". Muestra
también el uso actual del tope, mismo estilo que ya usa `locations/page.tsx`
("N de M profesionales activos en tu plan X" / "sin límite" si
`maxProfessionals` es `null`). Todo detrás de
`requireProfessionalsManageAccess`.

`src/app/dashboard/[tenantSlug]/professionals/new/page.tsx` — formulario:
nombre (requerido), bio (opcional, textarea), % comisión (número 0-100,
default 0), checkbox "Activo" (default marcado), checklist de "Servicios"
(todos los `Service` del tenant) y checklist de "Sedes" (todas las
`Location` del tenant) — mismo patrón visual que ya usa
`locations/[locationId]/page.tsx` para su checklist de profesionales.
Envía a `createProfessionalAction`.

`src/app/dashboard/[tenantSlug]/professionals/[professionalId]/page.tsx` —
mismo formulario que `new`, precargado con los datos actuales y las
casillas de servicios/sedes ya marcadas según `ProfessionalService`/
`ProfessionalLocation` existentes. Un solo botón "Guardar" que actualiza
todo junto (datos + asignaciones), mismo patrón que
`updateLocationAndProfessionalsAction`. Envía a `updateProfessionalAction`.

### 4. Server Actions

Nuevo `src/app/dashboard/[tenantSlug]/professionals/actions.ts`:

- `createProfessionalAction(tenantSlug, formData)`: `requireProfessionalsManageAccess`
  → valida nombre requerido y comisión 0-100 → aplica la regla del tope de
  la sección 1 si `active` viene marcado → si pasa, crea el `Professional`
  y en la misma transacción asigna los `ProfessionalService`/
  `ProfessionalLocation` marcados (**valida que cada `serviceId`/
  `locationId` recibido pertenezca al tenant antes de asignarlo** — nunca
  confíes en los ids que llegan del formulario) → redirige al detalle del
  profesional creado.
- `updateProfessionalAction(tenantSlug, professionalId, formData)`:
  `requireProfessionalsManageAccess` → busca el profesional filtrando por
  `tenantId` (404 si no es de este tenant) → aplica la regla del tope
  (excluyendo al propio profesional del conteo) → si pasa, actualiza sus
  datos y hace un set-replace de `ProfessionalService`/
  `ProfessionalLocation` (mismo patrón `deleteMany` + `upsert` en
  transacción que ya usa `applyLocationProfessionalsUpdate` en
  `locations/actions.ts`) → redirige de vuelta con `?saved=1`.

### 5. Link en el dashboard

En `src/app/dashboard/[tenantSlug]/page.tsx`: agrega el link
"Profesionales" → `/dashboard/${tenantSlug}/professionals`, visible solo
para OWNER/ADMIN (mismo `hasAnyOfRolesInTenantLocations(..., ["OWNER",
"ADMIN"])` que ya calcula esa página para el link de Reportes — puedes
reusar esa misma variable si el criterio de rol es idéntico).

## Qué NO hacer

- No toques `reports/actions.ts` ni `updateProfessionalCommissionRateAction`
  — la edición inline de comisión ahí se queda como está, aunque ahora
  también se pueda editar la comisión desde la nueva pantalla de
  profesionales. No es un conflicto, solo no la toques ni la dupliques.
- No crees ningún flujo para vincular un `Professional` a un `User`
  (login) — eso es "invitar usuarios a una sede", una fase aparte que
  todavía no arrancamos. `userId` se queda como está (opcional, sin UI
  para setearlo).
- No crees una pantalla de gestión de `Service` (crear/editar servicios)
  — el checklist de "Servicios" en el formulario de profesional solo lista
  los servicios que ya existen, no permite crear uno nuevo desde ahí.
- No toques `createLocationAction`, `updateLocationAction`,
  `updateLocationProfessionalsAction`, ni ninguna lógica de sedes más allá
  de lo que ya hace `hasReachedLocationLimit` (no la mezcles con la nueva
  `hasReachedProfessionalLimit`, son independientes).
- No agregues borrado de profesionales — igual que sedes e ítems de
  inventario, por ahora solo se desactivan (`active: false`).
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar.

## Verificación

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` limpios.
- Pruebas manuales sugeridas contra el tenant demo (que hoy tiene 2
  profesionales activos y está en plan PREMIUM, tope 8 — vas a necesitar
  bajarle el plan temporalmente en Prisma Studio para poder probar el
  bloqueo del tope, y revertirlo al terminar):
  1. Crea un profesional nuevo con datos básicos + un servicio + una sede
     marcados, confirma que aparece correctamente en la lista y que las
     asignaciones quedaron en `ProfessionalService`/`ProfessionalLocation`.
  2. Edítalo: cambia nombre/comisión, desmarca la sede que le habías
     asignado, marca otra, guarda, y confirma que el set-replace funcionó
     (la vieja asignación desaparece, la nueva aparece).
  3. Baja el plan del tenant demo a INDIVIDUAL (tope 1 profesional activo)
     temporalmente. Con 2+ profesionales ya activos, intenta crear uno
     nuevo activo (o reactivar uno inactivo) y confirma que se bloquea con
     el mensaje esperado. Confirma que crear uno **inactivo** sigue
     funcionando sin problema aunque estés sobre el tope. Sube el plan de
     nuevo al terminar.
  4. Desactiva un profesional (`active` a false) y confirma que nunca se
     bloquea por el tope, sin importar el plan.
