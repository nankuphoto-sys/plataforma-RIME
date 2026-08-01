# Fase 2 — CRM con ficha de cliente configurable por vertical

Contexto: ya está listo el schema multi-tenant, el login con permisos por sede
(`requireDashboardAccess`), la agenda pública y la agenda interna
(`src/app/dashboard/[tenantSlug]/page.tsx`), y los pagos con Stripe y Wompi.
Ahora toca la Fase 2 del roadmap (ver `CLAUDE.md`): CRM con ficha de cliente
configurable por vertical. **No te salgas de este alcance** — no toques pagos,
no toques la agenda pública ni interna existente salvo un link de navegación,
no implementes recordatorios de WhatsApp ni reportes/comisiones (fases
posteriores).

## Qué ya existe (no lo cambies innecesariamente)

- `Client` en `prisma/schema.prisma` ya tiene `customFields Json @default("{}")`
  — ahí es donde van los campos de la ficha configurable, NO agregues columnas
  nuevas por campo.
- `requireDashboardAccess(tenantSlug)` en `src/lib/auth-guards.ts` ya valida
  sesión + que el usuario tenga algún `StaffLocationRole` en el tenant. Reutilízalo
  tal cual en las páginas nuevas — no dupliques esa lógica.
- Cada tenant tiene una única sede por ahora (`tenant.locations[0]`, ver
  `src/app/dashboard/[tenantSlug]/page.tsx`), así que el CRM no necesita filtrar
  clientes por sede todavía — con filtrar por `tenantId` basta. NO implementes
  lógica de multi-sede aquí.
- Estilo de UI: Tailwind simple, sin librería de componentes, tal como
  `src/app/dashboard/[tenantSlug]/page.tsx` y `WeeklyAgenda.tsx`. Sigue ese
  mismo estilo (clases utilitarias directas, sin diseño nuevo).

## 1. Migración: vertical del tenant

Agrega a `prisma/schema.prisma`:

```prisma
enum TenantVertical {
  GENERAL
  PSICOLOGIA
  NUTRICION
  FISIOTERAPIA
  ESTETICA
}
```

Y en el modelo `Tenant`, un campo:

```prisma
vertical TenantVertical @default(GENERAL)
```

Antes de correr la migración: **detén `npm run dev` primero** (y Prisma Studio
si está abierto) — en este proyecto, en Windows, `prisma migrate dev` falla con
`EPERM` si el dev server sigue corriendo y tiene el query engine bloqueado.
Corre `npx prisma migrate dev --name add_tenant_vertical`, y cuando termine
vuelve a levantar `npm run dev`.

En el seed (`prisma/seed.ts`), pon el tenant demo (`consultorio-demo`) en
`vertical: "PSICOLOGIA"` — así se puede probar la ficha configurable de una
vez con datos de ejemplo.

## 2. Plantillas de campos por vertical

Crea `src/lib/clientFieldTemplates.ts` con algo así (ajusta tipos TS a tu
gusto, pero mantén esta forma de datos):

```ts
export type ClientFieldType = "text" | "textarea" | "number" | "date" | "select" | "boolean";

export interface ClientFieldDefinition {
  key: string; // clave dentro de Client.customFields
  label: string;
  type: ClientFieldType;
  options?: string[]; // solo para type "select"
}

export const CLIENT_FIELD_TEMPLATES: Record<TenantVertical, ClientFieldDefinition[]> = {
  GENERAL: [
    { key: "notas", label: "Notas generales", type: "textarea" },
  ],
  PSICOLOGIA: [
    { key: "motivoConsulta", label: "Motivo de consulta", type: "textarea" },
    { key: "diagnosticoCie10", label: "Diagnóstico (CIE-10)", type: "text" },
    { key: "medicacionActual", label: "Medicación actual", type: "textarea" },
    { key: "antecedentes", label: "Antecedentes relevantes", type: "textarea" },
  ],
  NUTRICION: [
    { key: "pesoActualKg", label: "Peso actual (kg)", type: "number" },
    { key: "alturaCm", label: "Altura (cm)", type: "number" },
    {
      key: "objetivo",
      label: "Objetivo",
      type: "select",
      options: ["Bajar de peso", "Subir masa muscular", "Mantener", "Salud general"],
    },
    { key: "alergiasAlimentarias", label: "Alergias alimentarias", type: "textarea" },
  ],
  FISIOTERAPIA: [
    { key: "zonaAfectada", label: "Zona afectada", type: "text" },
    { key: "diagnostico", label: "Diagnóstico", type: "text" },
    { key: "rangoMovilidad", label: "Rango de movilidad", type: "text" },
    { key: "dolorEscala", label: "Dolor (escala 1-10)", type: "number" },
  ],
  ESTETICA: [
    {
      key: "tipoPiel",
      label: "Tipo de piel",
      type: "select",
      options: ["Seca", "Grasa", "Mixta", "Sensible", "Normal"],
    },
    { key: "tratamientosPrevios", label: "Tratamientos previos", type: "textarea" },
    { key: "alergias", label: "Alergias", type: "textarea" },
  ],
};
```

(Puedes importar `TenantVertical` desde `@prisma/client`.) Esto NO es un
constructor de formularios editable por el usuario — son plantillas fijas en
código por vertical, a propósito, para mantener el alcance acotado. Un
constructor de campos personalizado por tenant queda fuera de esta fase.

Agrega una función pura `getClientFieldTemplate(vertical: TenantVertical): ClientFieldDefinition[]`
que devuelva `CLIENT_FIELD_TEMPLATES[vertical]`, y un test Vitest básico
(`src/lib/clientFieldTemplates.test.ts`) que verifique que cada vertical del
enum tiene una entrada definida (evita que alguien agregue un valor al enum y
se le olvide la plantilla).

## 3. Páginas del CRM

Bajo `src/app/dashboard/[tenantSlug]/clients/`:

### `page.tsx` — listado de clientes

- Usa `requireDashboardAccess(tenantSlug)`.
- Lista clientes del tenant (`prisma.client.findMany({ where: { tenantId } })`),
  ordenados por nombre. Muestra nombre, email, teléfono, y cantidad de citas
  (puedes usar `_count: { select: { appointments: true } }`).
- Buscador simple por nombre/email vía query param (`?q=`), filtrando en la
  query de Prisma con `contains`/`mode: "insensitive"`.
- Cada fila enlaza a `/dashboard/[tenantSlug]/clients/[clientId]`.
- Botón "+ Nuevo cliente" que enlaza a `/dashboard/[tenantSlug]/clients/new`.
- Agrega también un link "Clientes" en el header de
  `src/app/dashboard/[tenantSlug]/page.tsx` (junto al email/cerrar sesión o
  cerca del título) para poder navegar ahí — es el único cambio permitido en
  esa página.

### `new/page.tsx` + client component — creación de cliente

- Formulario con los campos base (`name` obligatorio, `email`, `phone`,
  `birthdate` opcionales) y, debajo, los campos dinámicos según
  `getClientFieldTemplate(tenant.vertical)`, renderizados según su `type`
  (input text/number/date, textarea, select con sus `options`, checkbox para
  boolean).
- Server action `createClientAction` (en `clients/actions.ts`) que arma
  `customFields` a partir de los valores dinámicos enviados (solo las keys de
  la plantilla del tenant, ignora cualquier otra cosa que llegue en el
  `FormData` para no permitir inyectar campos arbitrarios) y crea el `Client`
  con `tenantId` del tenant actual. Redirige a la ficha del cliente creado.

### `[clientId]/page.tsx` + client component — ficha de cliente

- Carga el cliente con `prisma.client.findFirst({ where: { id: clientId, tenantId } })`
  — **importante el `tenantId` en el where**, no solo el `id`, para no filtrar
  cross-tenant por id adivinado. Si no existe, `notFound()`.
- Muestra los campos base y, debajo, los campos dinámicos de la plantilla de
  la vertical del tenant en modo edición (mismo tipo de formulario que
  "nuevo", pero pre-llenado con los valores actuales de `customFields` y
  `name`/`email`/`phone`/`birthdate`).
- Server action `updateClientAction` con la misma lógica de whitelist de keys
  que `createClientAction`.
- Debajo del formulario, una sección "Historial de citas" listando las citas
  de ese cliente (`prisma.appointment.findMany({ where: { clientId, tenantId } })`,
  incluir `service` y ordenar por `startsAt` descendente), mostrando fecha,
  servicio y estado. Sin acciones sobre esas citas desde aquí — es solo
  lectura, para eso ya existe la agenda.

## 4. Qué NO hacer en esta fase

- No agregues un editor de plantillla de campos por tenant (eso es una fase
  futura si se necesita).
- No toques `Payment`, `Appointment` (solo lectura), ni los flujos de Stripe/Wompi.
- No implementes historial de cambios/auditoría de la ficha.
- No agregues recordatorios ni lógica de CRM predictivo (Fase 5).
- No cambies el flujo de reserva pública (`src/app/(public)/[tenantSlug]`) —
  sigue creando/reutilizando el cliente por email como ya hace
  `createAppointmentAction`, sin pedir los campos de la ficha ahí.

## 5. Verificación antes de terminar

- `npm run lint` y que corran los tests con Vitest (`npm test` o el comando
  que corresponda según `package.json`) sin errores, incluyendo el nuevo test
  de `clientFieldTemplates.test.ts`.
- Prueba manual: entra al dashboard del tenant demo, ve a "Clientes", crea un
  cliente nuevo con los campos de psicología (el seed debería dejar el tenant
  demo en vertical `PSICOLOGIA`), ábrelo, edita un campo, guarda, y confirma
  que el historial de citas se ve bien para el cliente demo que ya tiene citas
  (el que se creó en pruebas anteriores de Stripe/Wompi, si sigue en la base).

No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
flujo completo.
