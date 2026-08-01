# Prompt: Self-service signup para tenants nuevos

## Contexto

Hoy en día cada tenant nuevo se crea a mano (`prisma/seed.ts` o directo en
Prisma Studio) — no hay ninguna forma de que un negocio nuevo se registre solo.
Esto es, en este momento, el principal bloqueador para poder vender de verdad:
todo lo demás (agenda, CRM, pagos de citas, reportes, multi-sede,
feature-gating por plan, equipo, y cobro automático del SaaS vía Stripe
Subscriptions) ya está hecho y verificado.

El objetivo de esta fase es una página pública de registro donde un negocio
nuevo pueda crear su cuenta (tenant + primera sede + usuario OWNER) sin
intervención manual. **La configuración del cobro automático NO va aquí** —
eso ya existe en `/dashboard/[tenantSlug]/billing`
(`createSubscriptionCheckoutAction`, ya implementado y probado en vivo) y el
tenant nuevo simplemente lo configura después, igual que cualquier tenant
existente. Mezclar Stripe Checkout dentro del flujo de signup agregaría
complejidad y riesgo innecesarios a esta fase.

Antes de escribir código, revisá estos archivos para seguir exactamente los
mismos patrones y no inventar convenciones nuevas:

- `src/app/dashboard/[tenantSlug]/locations/actions.ts`
  (`createLocationAction`) — para saber los campos exactos de `Location`
  (nombre, dirección, timezone) y cómo se validan.
- `src/app/dashboard/[tenantSlug]/team/actions.ts` — para el patrón exacto de
  hasheo de contraseña (bcryptjs, salt rounds) y creación de `User` +
  `StaffLocationRole`.
- `src/lib/planLimits.ts` — para la lista de planes válidos (`Plan` enum) y
  sus límites, que ya rigen desde el momento de creación del tenant.
- `src/lib/auth.ts` / configuración de Auth.js v5 — para entender cómo se arma
  la sesión JWT (no hace falta tocarla, pero hay que respetar su forma).
- `prisma/schema.prisma` — modelos `Tenant`, `Location`, `User`,
  `StaffLocationRole` (campos exactos, constraints de unicidad como
  `Tenant.slug` y `User.email`).

## Qué hacer

### 1. Página pública `/signup`

Nueva ruta `src/app/signup/page.tsx` (fuera de `(public)/[tenantSlug]` y de
`dashboard/[tenantSlug]`, porque no depende de un tenant existente). Formulario
con:

- Nombre del negocio (se usa para generar el `slug` y el `Tenant.name`).
- Vertical (`TenantVertical`: GENERAL/PSICOLOGIA/NUTRICION/FISIOTERAPIA/ESTETICA).
- Plan (`Plan`: INDIVIDUAL/BASICO/PREMIUM/PRO) — mostrar precio y límites de
  cada uno como texto informativo (podés usar los valores de
  `src/lib/planLimits.ts` para los límites; los precios en USD/mes son los
  documentados en `CLAUDE.md` bajo "Tiers concretos": 19/35/59/99).
- Nombre completo del owner, email, contraseña + confirmación de contraseña.
- Nombre de la primera sede y su timezone (mismos campos que
  `createLocationAction`, para no duplicar lógica de validación de forma
  distinta).

### 2. Server Action `signUpTenantAction`

En `src/app/signup/actions.ts`:

1. Validar todos los campos (formato de email, contraseña con longitud mínima
   razonable, confirmación de contraseña igual a la original, plan y vertical
   dentro de los enums válidos).
2. Verificar que el email no esté ya en uso por **ningún** usuario del sistema
   (`User.email` es único globalmente, no por tenant — un usuario nunca
   pertenece a más de un tenant, como ya se documentó en la fase de Equipo).
   Si ya existe, error claro pidiendo que inicie sesión en vez de registrarse.
3. Generar un `slug` a partir del nombre del negocio (slugify básico: minúsculas,
   sin acentos, espacios a guiones). Si el slug ya existe, agregar un sufijo
   numérico incremental (`-2`, `-3`, ...) hasta encontrar uno libre — no fallar
   silenciosamente ni lanzar error al usuario por esto, es un detalle interno.
4. En una única transacción de Prisma:
   - Crear el `Tenant` con `plan` y `vertical` elegidos, `status: "TRIAL"`
     (nunca `ACTIVE` — el cobro se configura después, en la página de
     Facturación, igual que cualquier tenant).
   - Crear la primera `Location` con el nombre y timezone del formulario.
   - Crear el `User` (contraseña hasheada con el mismo patrón de bcryptjs que
     ya usa el proyecto), con `tenantId` del tenant recién creado.
   - Crear el `StaffLocationRole` con rol `OWNER` para ese usuario en esa sede.
5. Si todo sale bien, redirigir a `/login` con un mensaje de éxito (algo como
   `?signup=success`) para que inicie sesión con las credenciales que acaba de
   crear. **No** intentes loguear automáticamente al usuario dentro de la
   Server Action — es más simple y más seguro dejar que pase por el flujo de
   login normal de Auth.js.

### 3. Página de login

Extendé `src/app/login/page.tsx` (o donde viva hoy) para mostrar un mensaje
tipo "Cuenta creada correctamente, inicia sesión" cuando la URL trae
`?signup=success`, sin romper el comportamiento actual del login.

## Qué NO hacer

- No integres Stripe Checkout ni ningún cobro dentro del flujo de signup — el
  tenant nuevo queda en `status: "TRIAL"` y configura el cobro después desde
  `/dashboard/[tenantSlug]/billing`, que ya funciona y no hay que tocar.
- No toques `billing/actions.ts`, `billing/page.tsx`, `subscriptionPlans.ts`,
  ni el webhook de Stripe (`src/app/api/webhooks/stripe/route.ts`) — ya están
  completos y verificados en vivo.
- No toques `requireDashboardAccess` ni el hard-lock de `PAST_DUE`/`CANCELLED`
  — un tenant en `TRIAL` ya puede entrar al dashboard sin cambios adicionales,
  no hace falta ni conviene tocar esa lógica.
- No implementes verificación de email (confirmar correo antes de poder
  entrar) — fuera de esta fase.
- No implementes "olvidé mi contraseña" — es un hueco ya documentado en
  `CLAUDE.md` (fase de Equipo), pero es una fase aparte, no la mezcles acá.
- No crees una página de marketing/landing — solo la ruta `/signup` en sí.
- No toques `planLimits.ts` para agregar nada más que, como mucho, texto de
  precios si decidís mostrarlo desde ahí en vez de hardcodearlo en la página
  — no cambies los límites ni la lógica de gating existente.
- No agregues rate-limiting ni protección anti-bots (captcha, etc.) — anotalo
  como pendiente si querés, pero no lo implementes en esta pasada.
- No crees ningún `Professional` ni `Service` por defecto al hacer signup —
  eso lo configura el owner después desde el dashboard, igual que hoy.

## Verificación

1. Entrar a `/signup`, completar el formulario con un negocio nuevo y un plan
   cualquiera (por ejemplo BASICO), y confirmar que redirige a
   `/login?signup=success` con el mensaje visible.
2. En Prisma Studio, confirmar que se creó exactamente un `Tenant` nuevo
   (`status: TRIAL`, plan correcto), una `Location`, un `User` (contraseña
   hasheada, no en texto plano) y un `StaffLocationRole` con rol `OWNER`
   apuntando a esa sede.
3. Repetir el signup con el mismo nombre de negocio y confirmar que el
   segundo tenant obtiene un slug distinto (con sufijo numérico), sin error.
4. Intentar registrarse de nuevo con el mismo email ya usado y confirmar que
   se bloquea con un mensaje claro, sin crear ningún registro duplicado.
5. Iniciar sesión con las credenciales recién creadas y confirmar que entra a
   `/dashboard/[slug-nuevo]` sin redirigir a `account-locked` (porque
   `TRIAL` no está en el hard-lock), viendo la agenda vacía de ese tenant.
6. Entrar a `/dashboard/[slug-nuevo]/billing` y confirmar "Plan actual" y
   "Estado: TRIAL" correctos, con el botón "Configurar cobro automático"
   disponible (mismo comportamiento ya verificado para tenants existentes).
7. Si el plan elegido fue INDIVIDUAL (1 sede máximo), confirmar que intentar
   crear una segunda sede para ese tenant nuevo queda bloqueado por el límite
   de plan ya existente (`hasReachedLocationLimit`), confirmando que el
   gating por plan aplica desde el primer momento sin cambios adicionales.
