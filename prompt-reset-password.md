# Prompt: Recuperación y cambio de contraseña

## Contexto

El proyecto (ver `CLAUDE.md`) usa Auth.js v5 con provider de Credentials
(email + `User.passwordHash` con bcryptjs, sesión JWT). Hoy existen dos formas
de "poner" una contraseña:

1. Signup self-service (`src/app/signup/actions.ts`) — el usuario la elige.
2. Invitar a alguien a Equipo (`src/app/dashboard/[tenantSlug]/team/actions.ts`,
   función `createTeamMemberAction`) — se genera una contraseña temporal
   aleatoria (`generateTemporaryPassword()`, `crypto.randomBytes(9)`), se
   hashea con bcrypt, y se muestra en texto plano **una sola vez** al
   OWNER/ADMIN que invitó, vía una cookie httpOnly de `maxAge: 60`s
   (`newUserTempPassword`) — nunca en la URL.

No existe ningún flujo para que un usuario que YA tiene cuenta:
(a) cambie su contraseña estando logueado, o
(b) la recupere si la olvidó y no puede loguearse.

Tampoco existe ninguna infraestructura de email en el proyecto — el único
canal de notificación hoy es WhatsApp Business Cloud API, y ese es
exclusivamente para clientes finales (recordatorios de cita, avisos de
recompra), no para el equipo interno.

Decisión ya tomada (no la vuelvas a plantear): el mecanismo de "olvidé mi
contraseña" self-service va a ser por **email con link de recuperación**,
usando **Resend** como proveedor (nuevo, no hay ninguno hoy). Se eligió por
sobre "solo reseteo asistido por OWNER/ADMIN" porque un tenant `INDIVIDUAL`
(el segmento objetivo del producto: psicólogos/nutricionistas solos) tiene un
único usuario — si ese usuario se bloquea y no hay nadie más con acceso al
dashboard, hoy la única salida es tocar la base de datos a mano en Prisma
Studio. Se eligió por sobre "código por WhatsApp" porque hubiera requerido
agregar teléfono a `User` y sumar OTRA plantilla a aprobar por Meta, encima
de la que ya está pendiente de aprobación para recordatorios de cita.

Como complemento (no reemplazo) de lo anterior, esta fase también agrega un
reseteo asistido por OWNER/ADMIN desde Equipo — reutiliza casi 1:1 el patrón
ya existente de `createTeamMemberAction`, así que el costo marginal es bajo y
cubre el caso de un teammate cuyo email esté mal cargado o inaccesible.

## Qué hacer

### 1. Schema (Prisma) — aditivo, migración nueva

Nuevo modelo, sin tocar ningún campo existente:

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Agregar `passwordResetTokens PasswordResetToken[]` a `model User`.

**Nunca se guarda el token en texto plano** — mismo principio que las
contraseñas: se genera un token crudo (`crypto.randomBytes(32).toString("base64url")`),
se manda por email, y en la base solo se guarda su hash SHA-256
(`crypto.createHash("sha256").update(rawToken).digest("hex")`), que es lo que
se busca al validar. Si alguien accede a la base de datos no puede reconstruir
links de reseteo válidos.

Poné esta lógica compartida en `src/lib/passwordReset.ts`:
- `RESET_TOKEN_TTL_MINUTES = 60`
- `RESET_REQUEST_COOLDOWN_MINUTES = 2` (ver más abajo)
- `generateRawResetToken(): string`
- `hashResetToken(rawToken: string): string`

### 2. Envío de email — `src/lib/email.ts`

Nueva dependencia: `resend` (`npm install resend`). Nuevas variables en
`.env.example`:

```
RESEND_API_KEY=""
EMAIL_FROM="Plataforma Agenda <onboarding@resend.dev>"
```

`onboarding@resend.dev` es el remitente de sandbox de Resend — funciona sin
verificar un dominio propio, pero (limitación de Resend, no del código) en
cuentas sin dominio verificado solo entrega al email con el que se creó la
cuenta de Resend. Documentalo en un comentario en `email.ts`, no intentes
resolverlo con código.

```ts
// src/lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Plataforma Agenda <onboarding@resend.dev>",
      to,
      subject: "Restablecé tu contraseña — Plataforma Agenda",
      html: `... link a ${resetUrl}, aviso de que expira en 1 hora, y que si no lo pidió puede ignorar el correo ...`,
    });
  } catch (error) {
    // No relanzar: que falle el envío de email no debe romper la respuesta
    // al usuario (ver más abajo, requestPasswordResetAction nunca revela si
    // el envío funcionó o no). Solo lo logueamos para poder diagnosticarlo.
    console.error("Error enviando email de reseteo de contraseña", error);
  }
}
```

### 3. Flujo público "olvidé mi contraseña"

`src/app/forgot-password/page.tsx` + `ForgotPasswordForm.tsx` (client
component, mismo patrón que `src/app/login/LoginForm.tsx`) + `actions.ts` con
`requestPasswordResetAction(formData)`:

- Busca el `User` por email. **Sin importar si existe o no, la respuesta al
  usuario es siempre la misma** ("Si ese correo tiene una cuenta, te
  enviamos un link para restablecer tu contraseña.") — nunca reveles si el
  email existe o no (protección anti-enumeración, mismo cuidado que ya tiene
  el proyecto en otros formularios).
- Si existe: chequeá si ya hay un `PasswordResetToken` de ese usuario creado
  hace menos de `RESET_REQUEST_COOLDOWN_MINUTES` y sin usar/vencer — si lo
  hay, no crees uno nuevo ni reenvíes el email (evita que alguien reviente el
  botón de submit y sature el buzón); si no, generá el token, guardalo
  (hasheado) con `expiresAt = now + 60min`, y llamá a
  `sendPasswordResetEmail` con la URL `${NEXT_PUBLIC_APP_URL}/reset-password?token=<crudo>`.
- Redirige siempre a `/forgot-password?sent=1` (mismo mensaje, exista o no la
  cuenta).

`src/app/reset-password/page.tsx` + `ResetPasswordForm.tsx` + `actions.ts`
con `resetPasswordAction(token, formData)`:

- Lee `token` de la query string (`searchParams`), lo pasa al form (hidden
  input o bind del Server Action, tu elección).
- Valida `password.length >= 8` y `password === passwordConfirmation` —
  mismos criterios que ya usa `src/app/signup/actions.ts`.
- Hashea el token recibido y busca `PasswordResetToken` por `tokenHash`. Si no
  existe, o `usedAt` ya está seteado, o `expiresAt < now()` → redirige a
  `/reset-password?token=<token>&error=token-invalido` (mensaje genérico, no
  reveles cuál de los tres motivos fue).
- Si es válido: en una transacción, actualiza `User.passwordHash` (bcrypt,
  10 rounds, igual que el resto del proyecto), marca `usedAt = now()` en ese
  token, y borra/invalida cualquier OTRO `PasswordResetToken` sin usar de ese
  mismo usuario (si alguien pidió el link dos veces, el primero muere al usar
  el segundo, y viceversa).
- Redirige a `/login?reset=success`. `src/app/login/page.tsx` ya tiene el
  patrón de mostrar un mensaje según query param (`signup=success`) — agregá
  uno análogo para `reset=success`, y un link "¿Olvidaste tu contraseña?"
  apuntando a `/forgot-password`.

### 4. Flujo logueado "cambiar contraseña"

Nueva sección `src/app/dashboard/[tenantSlug]/account/page.tsx` +
`actions.ts` con `changePasswordAction(tenantSlug, formData)`:

- Guard: `requireDashboardAccess(tenantSlug)` (igual que Clientes/Inventario —
  cualquier usuario con acceso al dashboard, no hace falta OWNER/ADMIN; si el
  tenant está `PAST_DUE`/`CANCELLED` esto ya redirige solo a
  `account-locked`, mismo comportamiento que el resto del dashboard, no hay
  que replicarlo a mano).
- Form: contraseña actual, nueva contraseña, confirmación.
- Trae el `User` completo por `session.user.id` (la sesión JWT no trae el
  hash), valida la contraseña actual con `bcrypt.compare`. Si no matchea,
  redirige con error sin tocar nada.
- Si matchea: valida la nueva contraseña igual que el reseteo (`>= 8`
  caracteres, coincide con la confirmación), actualiza `passwordHash`, y de
  paso invalida cualquier `PasswordResetToken` pendiente de ese usuario (si
  tenía un link de recuperación por email sin usar dando vueltas, que muera
  al cambiar la contraseña por este otro camino).
- Redirige a la misma página con `?saved=1`.

Agregá el link "Mi cuenta" al array `navItems` de
`src/app/dashboard/[tenantSlug]/layout.tsx` (mismo array que ya tiene
Agenda/Clientes/Inventario/etc., `show: true` para que lo vea cualquiera con
acceso al dashboard).

### 5. Reseteo asistido por OWNER/ADMIN (complemento, en Equipo)

En `src/app/dashboard/[tenantSlug]/team/actions.ts`, agregá
`resetTeamMemberPasswordAction(tenantSlug, userId)` junto a las funciones
existentes (no las toques):

- Guard: `requireTeamManageAccess(tenantSlug)` (igual que
  `createTeamMemberAction`/`updateTeamMemberAction`).
- Misma regla anti-escalación que ya existe: un ADMIN (`isOwner === false`)
  no puede resetear la contraseña de un usuario que tiene rol OWNER en
  alguna sede del tenant (reutilizá la lógica ya escrita para detectar
  `targetAlreadyHasOwnerRole`, no la reimplementes distinto).
- Genera una nueva contraseña temporal con `generateTemporaryPassword()`
  (la función ya existe, reusala tal cual), la hashea, actualiza
  `User.passwordHash` del usuario objetivo, e invalida cualquier
  `PasswordResetToken` pendiente de ese usuario (mismo motivo que en el
  cambio de contraseña logueado).
- Guarda la contraseña en texto plano en la MISMA cookie httpOnly
  `newUserTempPassword` (mismo nombre, mismo `maxAge: 60`, mismo `path`) que
  ya usa `createTeamMemberAction` — no inventes un mecanismo nuevo de
  mostrarla.
- Redirige a `/dashboard/${tenantSlug}/team/${userId}?resetPw=1`.

En `src/app/dashboard/[tenantSlug]/team/[userId]/page.tsx`: agregá un botón
"Restablecer contraseña" (form separado del de roles, con
`resetTeamMemberPasswordAction.bind(null, tenantSlug, userId)`), y extendé la
condición que hoy solo chequea `created === "1"` para leer la misma cookie
también cuando `resetPw === "1"` (un solo bloque de UI para mostrar la
contraseña temporal, sirve para los dos casos).

## Qué NO hacer

- No implementes CAPTCHA ni rate-limiting por IP — el único control anti-abuso
  de esta fase es el cooldown de `RESET_REQUEST_COOLDOWN_MINUTES` por
  usuario. Rate-limiting real (Redis, Upstash, etc.) queda fuera de esta fase.
- No intentes invalidar sesiones JWT activas al cambiar la contraseña —
  Auth.js con `session: { strategy: "jwt" }` no tiene un store de sesiones
  para revocar tokens ya emitidos sin mantener una blacklist aparte. Fuera de
  esta fase: documentalo como limitación conocida, no lo resuelvas.
- No toques `src/lib/auth.ts` (el provider de Credentials en sí no cambia).
- No toques `createTeamMemberAction` ni `updateTeamMemberAction` — solo
  agregá la función nueva al mismo archivo.
- No agregues teléfono a `User` ni toques nada de WhatsApp
  (`src/lib/whatsapp.ts`, los crons de recordatorios/recompra).
- No agregues React Email ni ninguna librería de templates — HTML simple
  inline en `email.ts` alcanza para esta fase.
- No configures un dominio propio verificado en Resend — usá el sandbox
  `onboarding@resend.dev` y documentá la limitación de entrega.
- No toques `CLAUDE.md` — de eso me encargo yo.
- No toques `billing/`, `wompi-setup/`, ni ningún webhook existente.

## Verificación

Antes de dar la fase por cerrada, verificá en vivo (no solo por revisión de
código):

1. Corré la migración (`npm run db:migrate`) y confirmá en Prisma Studio que
   `PasswordResetToken` se creó bien relacionado a `User`.
2. Como el token crudo nunca se persiste (solo su hash), para probar
   `/reset-password` en un navegador real vas a necesitar capturarlo en el
   momento en que se genera — ya sea con un `console.log` temporal en dev
   (quitado antes de terminar) en `requestPasswordResetAction`, o escribiendo
   un test/script que llame directo a `generateRawResetToken`/
   `hashResetToken` sin pasar por el email. Elegí el que te resulte más
   simple, pero no des la fase por verificada sin probar el flujo completo
   con un token real de punta a punta al menos una vez.
3. Pedí un reset para un usuario real de prueba, confirmá que
   `sendPasswordResetEmail` se llama (si no hay `RESEND_API_KEY`
   configurada todavía, el envío va a fallar silenciosamente — confirmá que
   igual el token se crea en la base y que el flujo de creación no se rompe
   por eso).
4. Confirmá que pedir un segundo reset dentro de los 2 minutos NO crea un
   segundo `PasswordResetToken` (cooldown funcionando).
5. Probá `/reset-password?token=<token real>` con una contraseña nueva
   válida: confirmá que `User.passwordHash` cambió, que `usedAt` quedó
   seteado en ese token, y que **reusar el mismo link una segunda vez** es
   rechazado.
6. Forzá (vía Prisma Studio) un `expiresAt` en el pasado sobre un token sin
   usar y confirmá que ese link es rechazado.
7. Logueate con la contraseña nueva para confirmar que el reset realmente
   quedó aplicado.
8. Probá "Mi cuenta" logueado: contraseña actual incorrecta → rechazado sin
   cambiar nada; contraseña actual correcta + nueva válida → actualiza, y
   podés desloguearte y volver a entrar con la nueva.
9. Probá el reseteo asistido desde Equipo: como ADMIN, confirmá que NO podés
   resetear la contraseña de un usuario con rol OWNER (bloqueado, mismo
   mensaje que ya usa la regla de escalación existente); como OWNER, reseteá
   la contraseña de un STAFF de prueba, confirmá que la contraseña temporal
   mostrada una sola vez sirve para loguearse como ese usuario.
10. Confirmá que ninguno de los flujos existentes (login normal, invitar a
    Equipo, cambio de plan, Wompi, reportes) se rompió — no debería haber
    tocado ninguno de esos archivos salvo lo explícitamente listado arriba.

Cuando termines, contame qué verificaste en vivo (no solo qué escribiste) y
cualquier limitación que haya quedado pendiente (por ejemplo, si no llegaste
a probar la entrega real de un email por no tener `RESEND_API_KEY` a mano
todavía).
