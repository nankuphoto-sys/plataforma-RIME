# Fase 6 (parte 1/N): Feature-gating por plan

Ya quedó decidido y documentado en `CLAUDE.md` el modelo de precios
(suscripción pura) y los 4 tiers concretos (`Plan`: INDIVIDUAL/BASICO/
PREMIUM/PRO, con precios y límites — ver esa sección para el detalle
completo). Esta fase implementa **solo la parte de código que hace cumplir
esos límites**, sin tocar cobro/facturación todavía. El plan de cada
tenant se sigue asignando a mano (Prisma Studio) — no hay upgrade/downgrade
self-service ni Stripe/Wompi suscripciones en esta fase.

## Contexto importante antes de empezar

No existe ninguna pantalla para crear/activar/desactivar `Professional` en
la app (solo se crean vía `prisma/seed.ts`; lo único que toca `Professional`
hoy es la edición de `commissionRate` en Reportes). Por eso **esta fase NO
incluye el tope de profesionales activos por plan** — solo sedes y acceso a
módulos. El tope de profesionales queda pendiente para cuando exista una
pantalla de gestión de profesionales (fase futura, sin asignar todavía).

## Qué hacer

### 1. Config central de límites por plan

Nuevo archivo `src/lib/planLimits.ts`, con tests en
`src/lib/planLimits.test.ts`. Debe exportar:

```ts
export type PlanModule = "inventory" | "reengagement" | "reports";

export interface PlanLimits {
  maxLocations: number | null; // null = sin límite (PRO)
  modules: Record<PlanModule, boolean>;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  INDIVIDUAL: { maxLocations: 1, modules: { inventory: false, reengagement: false, reports: false } },
  BASICO:     { maxLocations: 1, modules: { inventory: false, reengagement: false, reports: true } },
  PREMIUM:    { maxLocations: 3, modules: { inventory: true, reengagement: true, reports: true } },
  PRO:        { maxLocations: null, modules: { inventory: true, reengagement: true, reports: true } },
};

export function getPlanLimits(plan: Plan): PlanLimits { ... }
export function planIncludesModule(plan: Plan, module: PlanModule): boolean { ... }
export function hasReachedLocationLimit(plan: Plan, currentLocationCount: number): boolean { ... }
```

Agrega un comentario arriba del archivo explicando que el tope de
profesionales activos queda deliberadamente fuera (ver "Contexto importante"
arriba), para que no se asuma que ya está cubierto.

### 2. Tope de sedes

En `createLocationAction`
(`src/app/dashboard/[tenantSlug]/locations/actions.ts`): antes de crear la
`Location`, usa `hasReachedLocationLimit(tenant.plan, tenant.locations.length)`
(el `tenant` que devuelve `requireOwnerAccess` ya trae `locations` cargadas)
para bloquear con un mensaje claro, ej.: `"Tu plan (BASICO) permite hasta 1
sede. Sube de plan para agregar más."` — usa el mismo patrón de
`redirect(...?error=...)` que ya usa esa acción para el caso "nombre
obligatorio".

En `src/app/dashboard/[tenantSlug]/locations/page.tsx` (la lista de sedes):
muestra el uso actual cerca del botón "+ Nueva sede", ej. "2 de 3 sedes
usadas en tu plan PREMIUM". Si ya llegó al tope, **oculta el link "+ Nueva
sede"** (mismo patrón que ya usa la página para ocultar cosas por rol) y
muestra en su lugar un texto explicando que alcanzó el máximo de su plan.

### 3. Acceso a módulos: Inventario y Reportes

En `src/lib/auth-guards.ts`:

- Nuevo guard `requireInventoryAccess(tenantSlug)`: llama a
  `requireDashboardAccess`, y si `!planIncludesModule(tenant.plan,
  "inventory")`, redirige a
  `/dashboard/${tenantSlug}/plan-required?feature=inventario&requiredPlan=PREMIUM`.
  Devuelve `{ session, tenant }` igual que los demás guards.
- `requireInventoryManageAccess` debe llamar a `requireInventoryAccess` (en
  vez de `requireDashboardAccess` directamente) y encima seguir exigiendo
  OWNER/ADMIN como ya hace — así la capa de plan queda por debajo de la capa
  de rol, sin duplicar el chequeo de plan.
- `requireReportsAccess` debe agregar el mismo chequeo de plan
  (`planIncludesModule(tenant.plan, "reports")`) antes/junto al chequeo de
  rol existente, redirigiendo a
  `/dashboard/${tenantSlug}/plan-required?feature=reportes&requiredPlan=BASICO`
  si el plan no lo incluye.

En `src/app/dashboard/[tenantSlug]/inventory/page.tsx` y
`[itemId]/page.tsx`: cambia `requireDashboardAccess` por
`requireInventoryAccess` (son las páginas de **ver** stock/movimientos, no
solo las de gestionar el catálogo — hoy cualquiera con acceso a la sede
puede verlas, y así debe seguir siendo, pero ahora también filtradas por
plan del tenant).

En `src/app/dashboard/[tenantSlug]/inventory/actions.ts`: en
`recordInventoryMovementAction` (que hoy llama a `requireDashboardAccess`
directamente, no a un guard de inventario), cámbialo por
`requireInventoryAccess`. Esto es importante: las Server Actions se pueden
invocar sin pasar por la página, así que el chequeo de plan tiene que estar
también ahí, no solo en la página (mismo principio que ya sigue el proyecto
de que "las mutaciones re-verifican permisos contra la base de datos").

Nueva página `src/app/dashboard/[tenantSlug]/plan-required/page.tsx`: usa
`requireDashboardAccess` (el usuario sigue teniendo que estar logueado y
pertenecer al tenant — esto no es una página pública), lee `feature` y
`requiredPlan` de `searchParams`, y muestra algo simple: "Tu plan actual
(`tenant.plan`) no incluye {feature}. Necesitas al menos el plan
{requiredPlan}." + link "← Volver a la agenda". No hace falta que sea
bonita, es un placeholder funcional.

### 4. CRM predictivo de recompra (sin pantalla, gating en el cron)

En `src/app/api/cron/detect-inactive-clients/route.ts`: al escanear
clientes, filtra para que **solo se procesen tenants cuyo plan incluya el
módulo `"reengagement"`** (`planIncludesModule(tenant.plan, "reengagement")`).
No toques `send-followup-reminders` — ese solo envía avisos ya encolados,
no necesita el chequeo de nuevo.

### 5. Bloqueo duro por PAST_DUE / CANCELLED

En `requireDashboardAccess` (`src/lib/auth-guards.ts`): justo después de
confirmar que `session.user.tenantId === tenant.id` (antes o después del
chequeo de rol, da igual, pero antes de devolver `{ session, tenant }`),
si `tenant.status === "PAST_DUE" || tenant.status === "CANCELLED"`, redirige
a `/dashboard/${tenantSlug}/account-locked`.

Nueva página `src/app/dashboard/[tenantSlug]/account-locked/page.tsx`:
**no puede usar `requireDashboardAccess`** (causaría un loop infinito de
redirects, porque esa página también quedaría bloqueada por sí misma). Hazle
su propio chequeo liviano: sesión válida + `session.user.tenantId ===
tenant.id` (sin el chequeo de rol ni de status), y muestra un mensaje tipo
"Tu cuenta está {status === 'PAST_DUE' ? 'con un pago pendiente' :
'cancelada'}. Contacta a soporte para reactivarla." No hace falta ningún
flujo de reactivación real todavía, es solo la pantalla de bloqueo.

Esto bloquea automáticamente TODO el dashboard interno (agenda, clientes,
reportes, sedes, inventario) porque todos esos guards ya pasan por
`requireDashboardAccess`. La agenda pública de reservas
(`src/app/(public)/[tenantSlug]/...`) no usa `requireDashboardAccess`, así
que no la toques y confirma que sigue funcionando igual (no debe
mencionarse `Tenant.status` en ningún lado de la carpeta `(public)`).

## Qué NO hacer

- No implementes cobro automático, suscripciones de Stripe/Wompi para el
  SaaS, ni upgrade/downgrade self-service. El plan se sigue cambiando a
  mano vía Prisma Studio.
- No implementes el tope de profesionales activos — no existe pantalla
  para gestionar profesionales todavía (ver "Contexto importante" arriba).
  No crees esa pantalla tampoco, está fuera de esta fase.
- No toques `updateLocationAction`, `updateLocationProfessionalsAction`,
  ni `createInventoryItemAction`/`updateInventoryItemAction` más allá de
  lo estrictamente necesario para enganchar el guard de plan (no cambies
  su lógica de negocio existente).
- No toques `send-followup-reminders`, `send-reminders`, ni la lógica de
  `src/lib/reengagement.ts` — el gating va solo en el escaneo de
  `detect-inactive-clients`.
- No toques nada de la carpeta `(public)` ni los flujos de pago
  (Stripe/Wompi de citas).
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar.

## Verificación

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` limpios.
- Pruebas manuales sugeridas (puedes cambiar el plan/status del tenant
  demo en Prisma Studio temporalmente y revertirlo al terminar, mismo
  patrón que ya se usó para probar el CRM predictivo con un cliente
  backdateado):
  1. Con el tenant demo en un plan con `maxLocations` ya alcanzado (o
     bájalo a BASICO temporalmente), confirma que "+ Nueva sede"
     desaparece de la lista y que intentar crear una sede igual (si
     fuerzas la navegación a `/locations/new`) es bloqueado por la acción
     con el mensaje de error esperado.
  2. Baja el plan del tenant demo a INDIVIDUAL temporalmente y confirma
     que entrar a Inventario y a Reportes redirige a `/plan-required` con
     el mensaje correcto, y que al intentar registrar un movimiento de
     inventario "a mano" (si alcanzas a invocar la acción) también se
     bloquea. Sube el plan de nuevo y confirma que vuelve a funcionar.
  3. Pon el `status` del tenant demo en `PAST_DUE` temporalmente y confirma
     que cualquier página del dashboard (agenda, clientes, sedes, etc.)
     redirige a `/account-locked`, que esa página carga sin loop, y que la
     agenda pública de reservas (`/book/[slug]` o como esté la ruta) sigue
     funcionando normal. Revierte el status al terminar.
  4. Llama manualmente `/api/cron/detect-inactive-clients` con el tenant
     demo en INDIVIDUAL (temporalmente) y confirma que no lo escanea /
     no cuenta contra el resultado; súbelo a PREMIUM y confirma que sí.
