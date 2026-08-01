# Fase 4 — Reportes y comisiones

Contexto: agenda, CRM, pagos (Stripe + Wompi) y recordatorios de WhatsApp ya
están listos (ver `CLAUDE.md`, Fases 1-3 hechas). Esto es la Fase 4:
reportes de citas/ingresos y cálculo de comisiones por profesional.
**No te salgas de este alcance** — no implementes exportar a CSV/PDF, no
implementes gráficos, no implementes un módulo de gestión de profesionales
(alta/baja/edición de datos del profesional) más allá de editar su
porcentaje de comisión, no implementes "marcar comisión como pagada" ni
ningún tipo de registro contable de pagos a profesionales, no implementes
comisión distinta por servicio (una sola tasa por profesional, global).

## Decisiones de diseño (no las cambies sin preguntar)

1. **Comisión = sobre el precio del servicio, no sobre lo cobrado por la
   plataforma.** `Service.price` ya se trata como base en USD en todo el
   código existente (ver el comentario "Fijo en USD por ahora" en
   `createCheckoutSessionAction`). La comisión de un profesional en un rango
   de fechas se calcula como: suma de `Service.price` de todas sus citas con
   `status: "COMPLETED"` cuyo `startsAt` cae en el rango, multiplicado por su
   `commissionRate` (%). **No uses `Payment.amount`** para esto — así el
   cálculo funciona igual para negocios que cobran en efectivo y no
   pasan todas sus citas por Stripe/Wompi.
2. **Ingresos cobrados por la plataforma es una sección aparte**, basada en
   `Payment` (`status: "PAID"`, citas con `startsAt` en el rango). Ojo:
   `Payment.currency` varía por proveedor (`"usd"` para Stripe, `"COP"` para
   Wompi) — **nunca sumes montos de distinta moneda en un solo número**.
   Agrupa y muestra el total por proveedor+moneda por separado (ej. "USD
   350.00 vía Stripe", "COP 560.000 vía Wompi").
3. **Todo el reporte se ancla a `Appointment.startsAt`** dentro del rango de
   fechas elegido (no a fecha de creación ni de confirmación de pago) — es
   el único eje de tiempo del reporte, para que las secciones sean
   consistentes entre sí.
4. **Acceso restringido a OWNER/ADMIN** — un `STAFF` o `PROFESSIONAL` no debe
   poder ver ingresos ni comisiones de todo el negocio. 404 si no tiene el
   rol adecuado (mismo patrón que `requireDashboardAccess`: no revelar que
   la página existe).

## 1. Migración: comisión por profesional

Agrega a `prisma/schema.prisma`, en el modelo `Professional`:

```prisma
commissionRate Decimal @default(0) @db.Decimal(5, 2) // porcentaje, 0-100
```

Detén `npm run dev` (y Prisma Studio si está abierto) antes de
`npx prisma migrate dev --name add_professional_commission_rate` — recuerda
el problema de `EPERM` en Windows si el dev server sigue corriendo. Vuelve a
levantar `npm run dev` al terminar.

## 2. Permisos: acceso restringido a OWNER/ADMIN

En `src/lib/authorization.ts`, agrega (junto a las funciones existentes, sin
tocarlas):

```ts
export function hasAnyOfRolesInTenantLocations(
  roles: StaffLocationRoleRecord[],
  tenantLocationIds: string[],
  allowedRoles: Role[]
): boolean {
  const tenantLocationIdSet = new Set(tenantLocationIds);
  return roles.some(
    (role) => tenantLocationIdSet.has(role.locationId) && allowedRoles.includes(role.role)
  );
}
```

Con su test correspondiente en `authorization.test.ts` (sigue el estilo de
los tests que ya existen ahí).

En `src/lib/auth-guards.ts`, agrega `requireReportsAccess(tenantSlug)` que
reutilice `requireDashboardAccess` y además exija OWNER o ADMIN:

```ts
export async function requireReportsAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasReportsAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasReportsAccess) notFound();

  return { session, tenant };
}
```

## 3. Lógica pura (con tests Vitest)

`src/lib/reports.ts`:

```ts
// Rango por defecto: el mes calendario actual (desde el día 1 a las 00:00
// hasta el instante actual del `now` pasado, en UTC — no compliques con
// timezone de sede acá, es solo el default del filtro, el usuario puede
// cambiar el rango).
export function getDefaultReportRange(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: now };
}

// Convierte un string "yyyy-mm-dd" de un query param a Date (00:00 UTC), o
// null si no es válido/está vacío.
export function parseReportDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// totalServiceRevenue y commissionRate como number (ya convertidos desde
// Decimal por quien llama). Redondea a 2 decimales.
export function calculateCommissionAmount(
  totalServiceRevenue: number,
  commissionRatePercent: number
): number {
  return Math.round(totalServiceRevenue * (commissionRatePercent / 100) * 100) / 100;
}
```

Tests (`reports.test.ts`): `getDefaultReportRange` con una fecha fija
devuelve el primer día del mes correspondiente; `parseReportDateParam` con
`"2026-08-15"` devuelve la fecha correcta, con `undefined`/`"basura"`
devuelve `null`; `calculateCommissionAmount(1000, 20)` devuelve `200`, con
decimales tipo `calculateCommissionAmount(333.33, 15)` redondea bien.

## 4. Página de reportes

`src/app/dashboard/[tenantSlug]/reports/page.tsx`:

- Usa `requireReportsAccess(tenantSlug)`.
- Lee `?from=` y `?to=` (yyyy-mm-dd) con `parseReportDateParam`; si faltan o
  son inválidos, usa `getDefaultReportRange(new Date())`.
- Un formulario simple (`method="get"`) con dos `<input type="date">` para
  elegir el rango, que al enviarse recarga la página con los query params.
- **Sección "Citas del período"**: cuenta de `Appointment` en el rango por
  `status` (`prisma.appointment.groupBy({ by: ["status"], where: {
  tenantId, startsAt: { gte: from, lte: to } }, _count: true })`), mostrada
  como una lista simple estado → cantidad.
- **Sección "Ingresos cobrados"**: `Payment` con `status: "PAID"` cuya cita
  tiene `startsAt` en el rango, agrupado por `provider` + `currency` (podés
  traer los pagos con `include: { appointment: true }` y agrupar en
  JS si `groupBy` con relación anidada es incómodo en Prisma — no hace falta
  que sea una sola query). Muestra por cada combinación proveedor+moneda: la
  suma y la cantidad de pagos.
- **Sección "Comisiones por profesional"**: para cada profesional activo del
  tenant, trae sus citas `COMPLETED` con `startsAt` en el rango (incluye
  `service` para el precio), suma `service.price`, aplica
  `calculateCommissionAmount` con su `commissionRate`, y muestra en una
  tabla: nombre, cantidad de citas completadas, ingreso por servicios,
  % comisión, comisión a pagar. Cada fila de la tabla incluye un campo
  numérico editable (`<input type="number" step="0.01">` dentro de un
  `<form>`) para actualizar el `commissionRate` de ese profesional, con un
  botón "Guardar" chico al lado.

`src/app/dashboard/[tenantSlug]/reports/actions.ts`:

```ts
export async function updateProfessionalCommissionRateAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireReportsAccess(tenantSlug);

  const raw = formData.get("commissionRate")?.toString();
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value < 0 || value > 100) {
    redirect(`/dashboard/${tenantSlug}/reports?error=${encodeURIComponent("El porcentaje debe estar entre 0 y 100.")}`);
  }

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) notFound();

  await prisma.professional.update({
    where: { id: professional.id },
    data: { commissionRate: value },
  });

  revalidatePath(`/dashboard/${tenantSlug}/reports`);
  redirect(`/dashboard/${tenantSlug}/reports`);
}
```

(Preserva los query params `from`/`to` actuales al redirigir de vuelta si te
es fácil hacerlo con los datos que ya tienes disponibles en el formulario;
si complica el código, no pasa nada si el rango vuelve al default después de
guardar — no es crítico.)

## 5. Link de navegación

Único cambio permitido en `src/app/dashboard/[tenantSlug]/page.tsx`: agrega
un link "Reportes" a `/dashboard/${tenantSlug}/reports` junto al de
"Clientes" que ya existe en el header, pero **solo renderízalo si**
`hasAnyOfRolesInTenantLocations(session.user.locationRoles, tenant.locations.map(l => l.id), ["OWNER", "ADMIN"])`
es `true` (la sesión ya trae `locationRoles` embebidos para esto — es una
ayuda de UI, la página de reportes igual revalida el permiso server-side por
su cuenta). Si el usuario no tiene el rol, simplemente no se muestra el link
— no cambies nada más en esa página.

## 6. Qué NO hacer en esta fase

- No exportes nada a CSV/PDF ni agregues gráficos — solo tablas/números.
- No implementes gestión de profesionales más allá de editar su
  `commissionRate` desde el reporte.
- No implementes "marcar comisión como pagada" ni ningún registro de pagos a
  profesionales — el reporte es de solo cálculo/lectura.
- No implementes comisión por servicio ni por sede — una tasa global por
  profesional.
- No toques `Payment`, `Appointment` (salvo lectura), CRM de clientes, ni
  los flujos de pago/recordatorios existentes.

## 7. Verificación antes de terminar

- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` — sin errores,
  incluyendo los tests nuevos de `reports.test.ts` y el nuevo caso en
  `authorization.test.ts`.
- Prueba manual: entra como `owner@demo.com`, click en "Reportes" (debería
  aparecer en el header porque OWNER tiene acceso), confirma que las tres
  secciones muestran datos coherentes con las citas/pagos de prueba que ya
  existen (Stripe, Wompi, CRM). Cambia el `commissionRate` de "Prof. Demo" a
  un valor como `30`, guarda, y confirma que la comisión calculada en la
  tabla cambia de acuerdo (ingreso por servicios × 30%). Prueba también
  cambiar el rango de fechas a uno que no incluya ninguna cita y confirma
  que las secciones muestran ceros sin romperse.

No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
flujo completo.
