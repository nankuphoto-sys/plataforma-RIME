# Prompt: Vincular un profesional a un usuario con login propio

## Contexto

Revisando el schema para planear esta fase encontré que **ya existe** el
campo `Professional.userId` (`String? @unique`, con `user User? @relation(...)`
y la relación inversa `User.professionalProfile Professional?`) — viene de
scaffolding muy temprano del proyecto, nunca se usó, y no requiere ninguna
migración nueva. El enum `Role` incluso trae ya el comentario
`PROFESSIONAL // atiende citas, ve solo su agenda`, pero eso último NO está
implementado: hoy la agenda interna (`src/app/dashboard/[tenantSlug]/page.tsx`)
trae TODAS las citas de la sede sin filtrar por profesional, y cualquiera con
acceso a esa sede (STAFF o PROFESSIONAL) ve la misma agenda compartida.

**Decisión de alcance ya tomada, no la vuelvas a plantear**: esta fase es
SOLO el vínculo de identidad + la invitación — un profesional puede tener un
login propio al dashboard, con el mismo nivel de visibilidad que tiene hoy
cualquier STAFF (la agenda completa de su sede, todos los clientes). Restringir
la agenda/clientes a "solo lo mío" para un login con rol PROFESSIONAL queda
explícitamente FUERA de esta fase — es una fase más grande, aparte, todavía
sin planear.

Hoy la única forma de que alguien tenga login al dashboard es vía Equipo
(`src/app/dashboard/[tenantSlug]/team/`), que crea un `User` + `StaffLocationRole`
por sede con un rol elegido a mano de una lista (incluye PROFESSIONAL como
una opción más del `<select>` de rol). Pero nada conecta hoy ese `User` con
un `Professional` real del catálogo — son dos cosas totalmente separadas.

## Qué hacer

Todo esto va en `src/app/dashboard/[tenantSlug]/professionals/actions.ts`
(agregar funciones nuevas, no toques las que ya existen) y en
`src/app/dashboard/[tenantSlug]/professionals/[professionalId]/page.tsx`
(agregar una sección nueva). **No toques `team/actions.ts` ni ningún archivo
de Equipo** — puede haber código muy similar (duplicar la regex de formato de
email, por ejemplo) en vez de extraer un helper compartido; preferí la
duplicación mínima a tocar un archivo de una fase anterior ya cerrada.

### 1. Sección nueva "Acceso al dashboard" en la ficha del profesional

Solo en `professionals/[professionalId]/page.tsx` (no en `professionals/new`
— hace falta que el profesional ya exista, con sus sedes ya asignadas, antes
de poder invitarlo). Tres estados posibles:

**A. `professional.userId` es null y el profesional NO tiene ninguna sede
asignada (`professionalLocations` vacío):** mostrar un aviso ("Asigná al
menos una sede a este profesional antes de darle acceso al dashboard") en vez
del formulario — sin al menos una sede asignada, el usuario nuevo quedaría
sin ningún `StaffLocationRole` y no podría ni loguearse (mismo motivo por el
que `createTeamMemberAction` ya bloquea si no se marca ningún rol).

**B. `professional.userId` es null y SÍ tiene sedes asignadas:** dos formas,
una junto a la otra:

- Formulario "Invitar como usuario nuevo" — campos `name` (valor default =
  `professional.name`, editable) y `email`. Acción nueva
  `inviteProfessionalAsUserAction(tenantSlug, professionalId, formData)`:
  - Valida nombre/email igual que `createTeamMemberAction` (formato de
    email con la misma regex, duplicada acá).
  - Si el email ya es de un `User` del mismo tenant → error sugiriendo
    vincular al existente en vez de invitar de nuevo. Si es de otro tenant →
    error genérico (mismo criterio que Equipo).
  - Crea el `User` (bcrypt, 10 rounds, mismo patrón) y, en la misma
    transacción, un `StaffLocationRole` con rol `PROFESSIONAL` por cada
    `ProfessionalLocation` que ya tenga asignado ese profesional — el rol
    NUNCA se elige a mano acá, siempre es `PROFESSIONAL` (a diferencia del
    `<select>` de Equipo). Setea `Professional.userId` al id del usuario
    recién creado, dentro de la misma transacción.
  - Contraseña temporal: mismo mecanismo que `createTeamMemberAction` —
    `generateTemporaryPassword()`, cookie httpOnly `newUserTempPassword`
    (mismo nombre, `maxAge: 60`, `path: "/dashboard"`). No inventes un
    mecanismo nuevo de mostrarla.
  - Redirige a `professionals/${professionalId}?invited=1`.

- Formulario "Vincular a un usuario existente del equipo" — `<select
  name="userId">` con los `User` del mismo tenant que NO tengan ya un
  `professionalProfile` vinculado (filtro `professionalProfile: null` o
  equivalente — un usuario no puede estar vinculado a dos profesionales a la
  vez, ya lo garantiza el `@unique` en `Professional.userId`, pero filtrá la
  lista igual para no ofrecer una opción que va a fallar). Acción nueva
  `linkExistingUserToProfessionalAction(tenantSlug, professionalId, formData)`:
  - Valida que el `userId` elegido pertenezca al tenant y no tenga ya un
    `professionalProfile`.
  - Setea `Professional.userId` a ese usuario.
  - Para cada `ProfessionalLocation` de este profesional, creá un
    `StaffLocationRole(role: PROFESSIONAL)` **solo si ese usuario todavía no
    tiene NINGÚN rol en esa sede** — nunca sobrescribas un rol que ya tenga
    (por ejemplo, si estás vinculando al propio OWNER del tenant consigo
    mismo como profesional — caso real y esperado en el plan INDIVIDUAL,
    donde el dueño es el único profesional — tiene que conservar su rol
    OWNER en cada sede, no degradar a PROFESSIONAL).
  - Redirige a `professionals/${professionalId}?linked=1`.

**C. `professional.userId` ya tiene un valor:** mostrar el nombre/email del
usuario vinculado, y un botón "Quitar vínculo" —
`unlinkProfessionalUserAction(tenantSlug, professionalId)` simplemente
setea `Professional.userId = null`. Esto NO borra el `User` ni le quita
ningún `StaffLocationRole` — solo rompe la asociación de identidad. Si el
OWNER además quiere revocarle el acceso al dashboard, ya existe Equipo para
eso.

Las tres acciones nuevas usan el mismo guard que ya usa toda la página:
`requireProfessionalsManageAccess(tenantSlug)` (OWNER o ADMIN). No hace falta
ninguna regla de anti-escalación de privilegios acá — a diferencia de Equipo,
el rol nunca se elige a mano, siempre es `PROFESSIONAL` (más bajo que ADMIN),
así que no hay forma de escalar privilegios por esta vía.

Reusá el bloque de cookie/mensaje de contraseña temporal que ya existe en
`team/[userId]/page.tsx` como referencia de estilo (no lo copies literal,
esta página tiene su propio layout), leyendo la cookie cuando
`invited === "1"`.

## Qué NO hacer

- No implementes el filtrado de agenda/clientes por profesional — un login
  PROFESSIONAL ve exactamente lo mismo que hoy ve un STAFF. Es la fase
  siguiente, no esta.
- No agregues ninguna migración de Prisma — `Professional.userId` y
  `User.professionalProfile` ya existen en el schema tal cual se necesitan.
- No sincronices automáticamente el `StaffLocationRole` del usuario vinculado
  cuando más adelante cambien las sedes asignadas al profesional (el
  checklist de sedes en `updateProfessionalAction` sigue funcionando igual
  que hoy, sin tocarlo) — el acceso se otorga una sola vez, al momento de
  invitar/vincular. Si después cambian las sedes del profesional y hace
  falta ajustar el acceso del usuario vinculado, eso se hace a mano desde
  Equipo. Documentalo como decisión deliberada, no como olvido.
- No toques `team/actions.ts`, `team/[userId]/page.tsx`, ni ningún otro
  archivo de la fase de Equipo.
- No toques `createProfessionalAction` ni `updateProfessionalAction` — solo
  agregá las tres funciones nuevas al mismo archivo `professionals/actions.ts`.
- No agregues un selector de rol en ninguno de los dos formularios nuevos —
  el rol siempre es `PROFESSIONAL`, fijo.
- No toques `CLAUDE.md` — de eso me encargo yo.

## Verificación

Antes de dar la fase por cerrada, verificá en vivo contra la base real (con
datos de prueba descartables, sin tocar `owner@demo.com`, borrando todo al
terminar):

1. Un profesional sin ninguna sede asignada: confirmá que la sección muestra
   el aviso de "asigná una sede primero" y no el formulario de invitar.
2. Asignale una sede a ese profesional, invitalo como usuario nuevo con un
   email de prueba: confirmá que se creó el `User`, que tiene exactamente un
   `StaffLocationRole(PROFESSIONAL)` por cada sede asignada al profesional
   (ni más ni menos), que `Professional.userId` quedó seteado, y que la
   contraseña temporal mostrada sirve para loguearse como ese usuario y ver
   la agenda de esa sede (igual que vería un STAFF).
3. Probá invitar con un email que ya es de otro usuario del mismo tenant:
   confirmá que se bloquea con el mensaje sugiriendo vincular en vez de
   invitar, sin crear nada.
4. Creá un usuario de prueba aparte (por Equipo, sin vincular a ningún
   profesional) y probá "vincular a un usuario existente" desde otro
   profesional de prueba: confirmá que aparece en el `<select>`, que vincular
   funciona, y que un usuario ya vinculado a un profesional NO aparece en la
   lista de otro profesional distinto.
5. Caso importante: vinculá al propio usuario OWNER de un tenant de prueba
   como profesional de sí mismo. Confirmá que sigue teniendo rol OWNER en
   todas sus sedes después de vincular (no se degradó a PROFESSIONAL en
   ninguna).
6. Probá "Quitar vínculo": confirmá que `Professional.userId` vuelve a null,
   que el `User` y sus `StaffLocationRole` NO se tocaron, y que se puede
   volver a invitar/vincular a otro usuario después.
7. Confirmá que la agenda interna, clientes, reportes, y todo lo demás sigue
   viéndose exactamente igual que antes de esta fase — no debería haber
   ningún cambio de comportamiento fuera de lo agregado.

Contame qué verificaste en vivo, no solo qué escribiste.
