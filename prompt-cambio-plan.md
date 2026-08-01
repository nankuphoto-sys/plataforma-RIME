# Prompt: Cambio de plan self-service (upgrade/downgrade)

## Contexto

Ya existe cobro automático vía Stripe Subscriptions (`prompt-cobro-automatico.md`
+ `prompt-cobro-automatico-fix.md`, verificado en vivo): `Tenant.stripeCustomerId`,
`Tenant.stripeSubscriptionId`, `src/lib/subscriptionPlans.ts` (`getStripePriceId`),
`requireBillingAccess` en `src/lib/auth-guards.ts`,
`src/app/dashboard/[tenantSlug]/billing/actions.ts`
(`createSubscriptionCheckoutAction`, `createBillingPortalSessionAction`) y
`src/app/dashboard/[tenantSlug]/billing/page.tsx`. Hoy el plan se fija una sola
vez al crear la suscripción (usa `tenant.plan` tal cual está en la base) y
cambiarlo después sigue siendo 100% manual en Prisma Studio.

Esta fase agrega que un OWNER con suscripción activa pueda cambiar de plan
desde `/billing`, sin pasar por Prisma Studio.

Decisiones de producto ya tomadas (no las reabras):
- El selector de plan vive DENTRO de la app (no el switcher nativo del
  Billing Portal de Stripe) — para tener control total sobre la UI y sobre
  cómo se muestran los límites de cada plan.
- El cambio de plan (upgrade o downgrade) se aplica siempre de inmediato,
  con el prorrateo default de Stripe (`proration_behavior: "create_prorations"`).
  No hay que diferir el downgrade al próximo ciclo ni usar Subscription
  Schedules — es una sobre-ingeniería para esta etapa del proyecto.
- Si al bajar de plan el tenant queda con más sedes o profesionales activos
  que los que permite el nuevo plan, el cambio se permite igual. NUNCA se
  desactiva nada automáticamente. Solo se le informa al usuario (texto, no
  bloqueo) que no va a poder agregar/activar más de ese recurso hasta que
  esté dentro del límite — el enforcement real ya existe y sigue intacto
  (`hasReachedLocationLimit`, `hasReachedProfessionalLimit`), no hay que
  tocarlo.
- `Tenant.plan` se actualiza SOLO desde el webhook
  (`customer.subscription.updated`), nunca de forma optimista dentro de la
  Server Action — mismo patrón que ya usa el resto de esta fase (el
  Checkout tampoco actualiza `Tenant.status` de forma optimista, espera al
  webhook).

Ya existen y NO deben tocarse en su comportamiento actual:
- `src/lib/subscriptionPlans.ts` → `getStripePriceId` (no cambiar su firma
  ni su comportamiento, solo agregarle una función nueva al lado).
- `src/app/dashboard/[tenantSlug]/billing/actions.ts` →
  `createSubscriptionCheckoutAction` y `createBillingPortalSessionAction`
  (siguen igual, esta fase les agrega una tercera acción al lado).
- `src/app/api/webhooks/stripe/route.ts` → las ramas existentes
  (`checkout.session.completed` en sus dos modos, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.deleted`). Esta fase le
  agrega una rama nueva (`customer.subscription.updated`), no toca las
  demás.
- `src/lib/planLimits.ts` (`PLAN_LIMITS`, `getPlanLimits`,
  `hasReachedLocationLimit`, `hasReachedProfessionalLimit`) — se usa tal
  cual, no se modifica.
- `src/app/signup/page.tsx` — hoy define `PLAN_OPTIONS` y `describePlan()`
  localmente. Esta fase los mueve a un archivo compartido para no duplicar
  la lista de planes/precios en dos lugares, pero el comportamiento visible
  de `/signup` no debe cambiar en nada.

## Qué hacer

### 1. `src/lib/subscriptionPlans.ts` — mapeo inverso

Agregar una función nueva al lado de `getStripePriceId` (no tocar esa):

```ts
export function getPlanFromStripePriceId(priceId: string): Plan | null {
  for (const plan of Object.keys(PRICE_ENV_VAR_BY_PLAN) as Plan[]) {
    const envVarName = PRICE_ENV_VAR_BY_PLAN[plan];
    if (process.env[envVarName] === priceId) return plan;
  }
  return null;
}
```

Devuelve `null` en vez de tirar error si no matchea ningún plan conocido —
el webhook la va a llamar ante cualquier `customer.subscription.updated`,
incluyendo eventos que no son un cambio de plan, y no debe fallar por eso.

### 2. `src/lib/planDisplay.ts` (archivo nuevo)

Mover acá, tal cual están hoy, `PLAN_OPTIONS` y `describePlan()` desde
`src/app/signup/page.tsx` (mismos valores: INDIVIDUAL 19, BASICO 35,
PREMIUM 59, PRO 99). Exportar ambos. Actualizar
`src/app/signup/page.tsx` para importarlos desde acá en vez de definirlos
localmente — sin cambiar nada más de ese archivo.

### 3. `src/app/dashboard/[tenantSlug]/billing/actions.ts` — acción nueva

```ts
export async function changeSubscriptionPlanAction(tenantSlug: string, newPlan: Plan): Promise<void>
```

1. `requireBillingAccess(tenantSlug)`.
2. Validar que `newPlan` sea uno de los valores del enum `Plan` (no confiar
   en el tipo de TypeScript solo — esto lo dispara un `<form>`, revalidar
   como hace el resto del proyecto con las Server Actions).
3. Si `tenant.stripeSubscriptionId` es `null` → `redirect` a
   `/dashboard/${tenantSlug}/billing?error=sin-suscripcion` (mismo query
   param que ya usa `createBillingPortalSessionAction` para el mismo caso).
4. Si `newPlan === tenant.plan` → `redirect` a
   `/dashboard/${tenantSlug}/billing?error=mismo-plan` sin llamar a Stripe.
5. `stripe.subscriptions.retrieve(tenant.stripeSubscriptionId)` para obtener
   el `id` del primer (único) subscription item.
6. `stripe.subscriptions.update(tenant.stripeSubscriptionId, { items: [{ id: subscriptionItemId, price: getStripePriceId(newPlan) }], proration_behavior: "create_prorations" })`.
7. `redirect` a `/dashboard/${tenantSlug}/billing?checkout=plan-changed`.

No actualizar `prisma.tenant` en esta acción — el `plan` se sincroniza solo
vía el webhook (paso 5).

### 4. Webhook `src/app/api/webhooks/stripe/route.ts` — rama nueva

Agregar un `else if (event.type === "customer.subscription.updated")` al
final de la cadena existente (después de `customer.subscription.deleted`,
sin tocar ninguna rama anterior):

```ts
} else if (event.type === "customer.subscription.updated") {
  const subscription = event.data.object as Stripe.Subscription;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? getPlanFromStripePriceId(priceId) : null;
  if (plan) {
    await prisma.tenant.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { plan },
    });
  }
}
```

Importar `getPlanFromStripePriceId` desde `@/lib/subscriptionPlans`. Esta
rama solo toca `plan`, nunca `status` — el status lo siguen manejando
exclusivamente `invoice.paid`/`invoice.payment_failed`/
`customer.subscription.deleted`, no dupliques esa lógica acá.

### 5. `src/app/dashboard/[tenantSlug]/billing/page.tsx` — selector de plan

Solo si `tenant.stripeSubscriptionId` existe (no tiene sentido cambiar de
plan antes de tener una suscripción configurada), agregar una sección
"Cambiar de plan":

- Listar `PLAN_OPTIONS` (importado de `@/lib/planDisplay`).
- El plan actual (`tenant.plan`) se marca como tal, sin botón de cambio.
- Cada plan distinto muestra su `describePlan()` y un botón/form
  "Cambiar a {label}" que llama a
  `changeSubscriptionPlanAction.bind(null, tenantSlug, option.value)`.
- Para calcular el aviso de "te vas a pasar del límite", contar en el mismo
  server component: `prisma.location.count({ where: { tenantId: tenant.id } })`
  y `prisma.professional.count({ where: { tenantId: tenant.id, active: true } })`.
  Para cada plan de la lista, si `getPlanLimits(option.value)` tiene
  `maxLocations`/`maxProfessionals` menor a esos conteos actuales, mostrar
  debajo del botón de ese plan un texto de advertencia (no un bloqueo):
  algo como "Hoy tenés {N} sedes / {M} profesionales activos, más de lo que
  incluye este plan. No se desactiva nada solo, pero no vas a poder agregar
  más hasta bajar de esa cifra."
- Agregar un texto fijo y corto arriba del selector explicando el
  prorrateo: "El cambio aplica de inmediato. Si subís de plan, Stripe cobra
  la diferencia prorrateada ahora; si bajás, te acredita la diferencia en tu
  próxima factura."
- Manejar los query params nuevos, mismo patrón que los existentes
  (`checkout`/`error`):
  - `checkout=plan-changed` → mensaje de éxito, aclarando que puede tardar
    unos segundos en reflejarse (depende del webhook).
  - `error=mismo-plan` → mensaje simple ("Ya estás en ese plan.").
  - `error=sin-suscripcion` ya existe, no lo toques.

## Qué NO hacer

- No usar el switcher nativo del Billing Portal de Stripe para esto.
- No usar Subscription Schedules ni diferir el downgrade al próximo ciclo
  de facturación — siempre inmediato con `create_prorations`.
- No bloquear un downgrade aunque el tenant quede por encima del límite del
  plan nuevo en sedes o profesionales activos — solo advertir en la UI.
- No desactivar profesionales ni tocar sedes automáticamente al cambiar de
  plan.
- No actualizar `Tenant.plan` de forma optimista dentro de
  `changeSubscriptionPlanAction` — la única fuente de verdad es el webhook.
- No tocar `Tenant.status` desde la rama `customer.subscription.updated`.
- No tocar las ramas existentes del webhook, `createSubscriptionCheckoutAction`,
  `createBillingPortalSessionAction`, `requireBillingAccess`,
  `planLimits.ts`, ni el comportamiento visible de `/signup`.
- No implementar nada de Wompi recurrente (fase aparte).
- No agregar selector de cantidad/prorrateo manual ni ningún control de
  facturación adicional más allá de elegir el plan destino.
- No tocar `CLAUDE.md`.

## Verificación

1. Con un tenant OWNER que ya tiene `stripeSubscriptionId` (suscripción
   activa configurada), entrar a `/billing` y confirmar que aparece
   "Cambiar de plan" con los 4 planes, el actual marcado y sin botón de
   cambio para sí mismo.
2. Cambiar de un plan menor a uno mayor (ej. BASICO → PREMIUM). Confirmar
   en el Dashboard de Stripe que la suscripción cambió de Price y generó un
   ítem de prorrateo. Confirmar en Prisma Studio que `Tenant.plan` pasó a
   `PREMIUM` después de que llegue el webhook.
3. Confirmar que el feature-gating reacciona solo: si el tenant no tenía
   acceso a Inventario en BASICO, después del cambio a PREMIUM el link
   "Inventario" aparece sin necesidad de cerrar sesión (el gating de
   módulos lee `tenant.plan` de la base en cada request, no del JWT).
4. Bajar de un plan mayor a uno menor con recursos existentes por encima
   del nuevo límite (ej. tenant con 5 profesionales activos en PREMIUM
   bajando a BASICO, que permite 3). Confirmar: el cambio se permite,
   `Tenant.plan` queda en `BASICO`, nadie se desactivó solo, la página de
   Profesionales sigue mostrando a los 5 activos, y al intentar
   activar/crear un profesional nuevo como activo el sistema lo bloquea con
   el mensaje de tope ya existente (`hasReachedProfessionalLimit`).
5. Confirmar que las demás ramas del webhook (pago exitoso, pago fallido,
   cancelación) y el flujo de pagos de citas de clientes finales no
   cambiaron de comportamiento — revisar el diff, no hace falta re-probar
   todo en vivo si el código de esas ramas no se tocó.
6. Confirmar que `/signup` se ve y funciona exactamente igual que antes
   después de mover `PLAN_OPTIONS`/`describePlan` al archivo compartido.
