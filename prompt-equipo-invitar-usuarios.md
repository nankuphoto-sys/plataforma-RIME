# Invitar usuarios a una sede ("Equipo")

Hoy no hay ninguna forma de darle acceso al dashboard a alguien más que no
sea vía `prisma/seed.ts` — un OWNER no puede sumar a su equipo (otro
profesional con login, un ADMIN de sede, un STAFF de recepción) sin que
alguien edite `User`/`StaffLocationRole` a mano.

No hace falta ninguna migración de Prisma — `User` y `StaffLocationRole`
ya tienen todo lo necesario. Esta fase es 100% código de aplicación, con
una salvedad: no hay infraestructura de email en el proyecto (solo
WhatsApp Business Cloud API para clientes finales), así que esto **no es
un flujo de invitación por link mágico**. Es un alta directa: el OWNER/ADMIN
crea el usuario con una contraseña temporal generada por el sistema, y se
la pasa a la persona por fuera de la app (WhatsApp, en persona, etc.).

## Modelo mental (ya validado, no lo cambies)

- `User.tenantId` es fijo — un usuario pertenece a un solo tenant, nunca a
  varios.
- `StaffLocationRole` ya permite un rol **distinto por sede** para el mismo
  usuario (`role` es OWNER/ADMIN/STAFF/PROFESSIONAL). La UI debe reflejar
  esto: una tabla con un selector de rol independiente por cada sede, no
  "un solo rol aplicado a varias sedes".
- Quitarle a alguien todas sus filas de `StaffLocationRole` en el tenant
  YA es "revocar su acceso" — no hace falta ningún flag de "usuario
  desactivado" nuevo. Esto es intencional, no lo cambies.

## Qué hacer

### 1. Guard de acceso + regla anti-escalación de privilegios

En `src/lib/auth-guards.ts`: nuevo `requireTeamManageAccess(tenantSlug)` —
`requireDashboardAccess` + exige OWNER o ADMIN (mismo criterio que
Reportes/Inventario-gestión/Profesionales). Además, calcula y devuelve
también `isOwner: boolean` (si el usuario de la sesión tiene rol OWNER en
alguna sede del tenant), porque las Server Actions de esta sección
necesitan saber si quien actúa es OWNER o "solo" ADMIN:

```ts
export async function requireTeamManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);
  const hasTeamAccess = hasAnyOfRolesInTenantLocations(..., ["OWNER", "ADMIN"]);
  if (!hasTeamAccess) notFound();
  const isOwner = hasAnyOfRolesInTenantLocations(..., ["OWNER"]);
  return { session, tenant, isOwner };
}
```

**Regla de negocio importante, aplícala dentro de las Server Actions (no
solo en el guard)**: si quien actúa NO es OWNER (es ADMIN):

- No puede dejar a nadie con rol `OWNER` en ninguna sede — si el
  formulario enviado incluye `OWNER` en cualquier fila, bloquear con
  `"Solo un OWNER puede asignar el rol OWNER."`.
- No puede editar a un usuario que **ya tiene** rol OWNER en alguna sede
  del tenant — bloquear con `"Solo un OWNER puede editar los accesos de
  otro OWNER."` antes de aplicar ningún cambio.

Esto evita que un ADMIN se otorgue a sí mismo o a otro usuario privilegios
de OWNER, o le quite acceso a un OWNER existente.

**Otra regla de seguridad, aplica siempre (incluso para un OWNER)**: si el
usuario que se está editando es el mismo que está haciendo la acción
(`professional... userId === session.user.id`), y el resultado del
guardado lo dejaría sin ninguna fila de `StaffLocationRole` en el tenant,
bloquea con `"No puedes quitarte a ti mismo todo tu acceso."` — para
evitar que alguien se bloquee a sí mismo por accidente.

### 2. Páginas

`src/app/dashboard/[tenantSlug]/team/page.tsx` — lista de todos los `User`
del tenant, con sus roles por sede (ej. "Sede Principal: ADMIN · Sede
Norte: STAFF", o "Sin acceso" si no tiene ninguna fila). Link
"+ Invitar usuario". Todo detrás de `requireTeamManageAccess`.

`src/app/dashboard/[tenantSlug]/team/new/page.tsx` — formulario: nombre
(requerido), email (requerido), y una tabla con una fila por cada
`Location` del tenant, cada una con un `<select>` de rol: "Sin acceso"
(default), OWNER, ADMIN, STAFF, PROFESSIONAL. Si quien está logueado es
ADMIN (no OWNER), oculta o deshabilita la opción "OWNER" en los selects
(refuerza en UI la regla de la sección 1, que igual se valida server-side).
Envía a `createTeamMemberAction`.

`src/app/dashboard/[tenantSlug]/team/[userId]/page.tsx` — misma tabla de
sede→rol, precargada con las filas actuales de `StaffLocationRole` de ese
usuario (nombre y email se muestran de solo lectura, no son editables en
esta fase). Envía a `updateTeamMemberAction`.

Cuando la creación termine exitosamente, la página de detalle del usuario
recién creado debe mostrar, una sola vez, la contraseña temporal generada
(ver sección 3 para el mecanismo) en un banner tipo "Guarda esta
contraseña ahora, no se va a volver a mostrar: `XXXXXXXXXXXX`".

### 3. Server Actions

Nuevo `src/app/dashboard/[tenantSlug]/team/actions.ts`:

- `createTeamMemberAction(tenantSlug, formData)`:
  1. `requireTeamManageAccess`.
  2. Valida nombre y email requeridos; valida formato básico de email.
  3. Aplica la regla anti-escalación de la sección 1 sobre los roles
     enviados.
  4. Exige que al menos una sede tenga un rol distinto de "Sin acceso"
     (invitar a alguien con cero acceso no tiene sentido) — bloquea si no.
  5. Busca si ya existe un `User` con ese email:
     - Si existe y es del **mismo tenant**: bloquea con
       `"Ese correo ya tiene una cuenta en tu equipo. Edítalo desde la lista."`
       (sin crear nada).
     - Si existe y es de **otro tenant**: bloquea con
       `"Ese correo ya pertenece a otra cuenta y no se puede usar aquí."`
  6. Si no existe: genera una contraseña temporal aleatoria con el módulo
     `crypto` de Node (built-in, no agregues ninguna librería nueva —
     nada de `Date.now()` ni valores predecibles), hashéala con
     `bcryptjs` (ya es dependencia del proyecto, mismo patrón que
     `auth.ts`/`seed.ts`), y en una transacción crea el `User` +
     las filas de `StaffLocationRole` para cada sede con rol distinto de
     "Sin acceso".
  7. Justo antes del `redirect`, guarda la contraseña en texto plano en
     una cookie **httpOnly, `maxAge: 60` segundos** (ej.
     `cookies().set("newUserTempPassword", plainPassword, { httpOnly: true, maxAge: 60, path: "/dashboard" })`)
     — nunca la pongas en la URL ni en un query param, eso quedaría en el
     historial del navegador y en logs.
  8. Redirige a `/dashboard/${tenantSlug}/team/${user.id}?created=1`.

- `updateTeamMemberAction(tenantSlug, userId, formData)`:
  1. `requireTeamManageAccess`.
  2. Busca el usuario filtrando por `tenantId` (404 si no es de este
     tenant).
  3. Aplica la regla anti-escalación de la sección 1 (incluyendo el
     chequeo de "el usuario editado ya tiene OWNER en alguna sede").
  4. Aplica la regla de "no te quites tu propio último acceso" si
     `userId === session.user.id`.
  5. Set-replace transaccional de `StaffLocationRole` para ese usuario, a
     partir de la tabla sede→rol enviada (filas en "Sin acceso" se
     eliminan, el resto se upsertea con el rol elegido) — mismo patrón
     `deleteMany` + `upsert` en transacción que `applyLocationProfessionalsUpdate`
     en `locations/actions.ts`, adaptado a que acá el rol también puede
     cambiar (no es solo asignar/desasignar).
  6. Redirige a `/dashboard/${tenantSlug}/team/${userId}?saved=1`.

En `src/app/dashboard/[tenantSlug]/team/[userId]/page.tsx`: si
`searchParams.created === "1"`, lee la cookie `newUserTempPassword` con
`cookies().get(...)` y muéstrala en el banner descrito en la sección 2. No
hace falta borrarla activamente desde el Server Component (no está
permitido mutar cookies durante el render) — el `maxAge: 60` ya la expira
sola.

### 4. Link en el dashboard

En `src/app/dashboard/[tenantSlug]/page.tsx`: agrega el link "Equipo" →
`/dashboard/${tenantSlug}/team`, visible para OWNER/ADMIN (reusa la misma
variable de rol que ya usan los links de Reportes/Profesionales si el
criterio es idéntico).

## Qué NO hacer

- No implementes ningún flujo de invitación por email/link mágico — no
  hay proveedor de email en el proyecto, y agregarlo está fuera de esta
  fase.
- No implementes "cambiar mi contraseña" ni "olvidé mi contraseña" para
  el usuario invitado — se queda con la contraseña temporal hasta que
  exista esa fase (documenta este hueco, no lo resuelvas).
- No permitas editar `name`/`email` de un usuario ya existente desde
  `/team/[userId]` — esa página solo gestiona sus `StaffLocationRole`.
- No agregues borrado de usuarios — "Sin acceso" en todas las sedes ya
  cumple la función de revocar acceso, sin necesidad de borrar el `User`.
- No toques `Professional.userId` ni ningún vínculo profesional↔usuario
  — esta fase es solo sobre acceso al dashboard (`StaffLocationRole`), no
  sobre la ficha de profesional.
- No toques `locations/actions.ts`, `professionals/actions.ts`, ni
  ninguna otra Server Action existente.
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar.

## Verificación

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` limpios.
- Pruebas manuales sugeridas contra el tenant demo, logueado como
  `owner@demo.com` (OWNER):
  1. Invita un usuario nuevo (nombre, email nuevo, ADMIN en una sede).
     Confirma que la página de detalle muestra la contraseña temporal una
     sola vez, que el usuario aparece en la lista con el rol correcto, y
     que refrescar la página ya no muestra la contraseña (pasado el
     `maxAge`, o simplemente confirma que la cookie tiene el `maxAge`
     correcto).
  2. Intenta invitar con el mismo email de nuevo — confirma que se
     bloquea con el mensaje de "ya tiene una cuenta en tu equipo", sin
     crear un usuario duplicado.
  3. Edita ese usuario: cámbiale el rol en esa sede y agrégale otra sede
     con un rol distinto. Confirma en la base que quedaron los roles
     correctos por sede.
  4. Quítale todas las sedes (todas en "Sin acceso") y guarda — confirma
     que ya no tiene ninguna fila de `StaffLocationRole` y que si
     intentaras loguearte como ese usuario, `requireDashboardAccess` le
     daría 404 en el dashboard.
  5. Con un usuario de prueba en rol ADMIN (puedes editar temporalmente
     el rol de un usuario de prueba a ADMIN vía Prisma Studio para esta
     prueba), confirma que NO puede asignar OWNER a nadie (el select lo
     oculta/deshabilita, y si de todos modos se fuerza el submit, la
     acción lo bloquea), y que tampoco puede editar a un usuario que ya
     tiene OWNER en alguna sede.
  6. Como OWNER, intenta dejarte a ti mismo sin ningún acceso — confirma
     que se bloquea con el mensaje de "no puedes quitarte tu propio
     acceso".
  Revierte cualquier dato de prueba (usuarios, roles) al terminar, mismo
  criterio que ya se usó en fases anteriores.
