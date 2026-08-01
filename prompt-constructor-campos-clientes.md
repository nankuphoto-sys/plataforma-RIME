# Prompt: Constructor de campos personalizados por tenant (ficha de cliente)

## Contexto

Hoy la ficha de cliente configurable por vertical (`src/lib/clientFieldTemplates.ts`,
`CLIENT_FIELD_TEMPLATES`) es una lista FIJA en código por cada
`TenantVertical` (GENERAL/PSICOLOGIA/NUTRICION/FISIOTERAPIA/ESTETICA), y el
comentario del archivo dice explícitamente "NO es un constructor de
formularios editable por el usuario". Esta fase agrega justo eso: que un
tenant pueda agregar SUS PROPIOS campos extra a la ficha, más allá de la
plantilla fija de su vertical.

**Decisión de alcance ya tomada, no la vuelvas a plantear**: es **aditivo,
no un reemplazo**. Los campos fijos de la plantilla de vertical siguen
existiendo tal cual, sin poder ocultarse, editarse ni reordenarse desde esta
fase — un tenant PSICOLOGIA siempre va a ver "Diagnóstico (CIE-10)" igual
que hoy. Lo único nuevo es la posibilidad de agregar campos ADICIONALES,
propios de ese tenant. Tampoco está atado a la vertical — los campos
personalizados de un tenant se agregan siempre, sin importar cuál sea su
`vertical` (hoy no hay forma de cambiar el vertical de un tenant después del
signup, así que no hace falta resolver ese cruce).

**Decisión de negocio ya tomada**: esta función NO tiene gating de plan —
está disponible en los 4 planes por igual (INDIVIDUAL incluido). Es una
extensión de la ficha configurable por vertical, que ya está listada como
incluida desde el plan más barato.

Revisá bien estos archivos antes de tocar nada, son el corazón de la
integración:
- `src/lib/clientFieldTemplates.ts` — define `ClientFieldType` (unión de
  strings en minúscula: `"text" | "textarea" | "number" | "date" | "select" |
  "boolean"`), `ClientFieldDefinition`, `CLIENT_FIELD_TEMPLATES`, y
  `getClientFieldTemplate(vertical)`.
- `src/app/dashboard/[tenantSlug]/clients/ClientForm.tsx` — renderiza
  dinámicamente cualquier `ClientFieldDefinition[]` que reciba por props
  (componente `DynamicField`). **Ya es completamente genérico — no necesita
  ningún cambio.**
- `src/app/dashboard/[tenantSlug]/clients/actions.ts` — `buildCustomFields`
  arma `Client.customFields` SOLO a partir de las keys presentes en el
  `fieldTemplate` que recibe (whitelist, ignora cualquier otra cosa del
  FormData). **Tampoco necesita cambios en su lógica** — solo en de dónde
  saca el `fieldTemplate`.
- Tres call sites de `getClientFieldTemplate(tenant.vertical)` (síncrono
  hoy): `clients/new/page.tsx` línea 18, `clients/[clientId]/page.tsx` línea
  38, y dos veces en `clients/actions.ts` (`createClientAction` y
  `updateClientAction`).

La estrategia de integración es agregar una función nueva **async**,
`getEffectiveClientFieldTemplate(tenantId, vertical)`, que devuelve
`[...plantilla fija, ...campos personalizados activos del tenant]` como un
solo array de `ClientFieldDefinition` — y reemplazar esos 4 call sites por
`await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical)`. Con
esto, `ClientForm.tsx` y `buildCustomFields` funcionan sin ningún cambio: ya
son genéricos sobre cualquier `ClientFieldDefinition[]` que reciban.

## Qué hacer

### 1. Schema (Prisma) — aditivo, migración nueva

```prisma
enum CustomClientFieldType {
  TEXT
  TEXTAREA
  NUMBER
  DATE
  SELECT
  BOOLEAN
}

model TenantClientField {
  id        String                @id @default(cuid())
  tenantId  String
  tenant    Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  key       String                // clave dentro de Client.customFields, autogenerada del label
  label     String
  type      CustomClientFieldType
  options   Json?                 // array de strings, solo relevante si type = SELECT
  order     Int                   @default(0)
  active    Boolean               @default(true)
  createdAt DateTime              @default(now())

  @@unique([tenantId, key])
  @@index([tenantId])
}
```

Agregá `clientFields TenantClientField[]` a `model Tenant`.

### 2. `getEffectiveClientFieldTemplate` en `src/lib/clientFieldTemplates.ts`

```ts
export async function getEffectiveClientFieldTemplate(
  tenantId: string,
  vertical: TenantVertical
): Promise<ClientFieldDefinition[]> {
  const fixed = getClientFieldTemplate(vertical);
  const custom = await prisma.tenantClientField.findMany({
    where: { tenantId, active: true },
    orderBy: { order: "asc" },
  });
  const mapped: ClientFieldDefinition[] = custom.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type.toLowerCase() as ClientFieldType,
    options: Array.isArray(field.options) ? (field.options as string[]) : undefined,
  }));
  return [...fixed, ...mapped];
}
```

(Vas a necesitar importar `prisma` en este archivo — hoy no lo hace.)

Actualizá los 4 call sites mencionados arriba para usar esta función nueva
(`await`, ya que ahora es async — los tres archivos que la llaman ya son
Server Components/Server Actions `async`, así que no hace falta ningún
cambio de estructura, solo agregar el `await`). **No cambies nada más en
esos archivos.**

### 3. Gestión de campos personalizados — nueva sección del dashboard

Guard nuevo en `src/lib/auth-guards.ts`: `requireClientFieldsManageAccess`
(mismo patrón que `requireServicesManageAccess` — OWNER/ADMIN, sin gating de
plan).

`src/app/dashboard/[tenantSlug]/client-fields/actions.ts`:

- `createClientFieldAction(tenantSlug, formData)` — campos del form: `label`
  (texto), `type` (`<select>` con las 6 opciones), `options` (textarea,
  **una opción por línea**, solo relevante si `type = SELECT`).
  - Generá `key` a partir del `label`: normalizar (NFD, sacar marcas
    combinantes, minúsculas), reemplazar cualquier caracter que no sea
    `[a-z0-9]` por `_`, sacar guiones bajos al principio/final. Si queda
    vacío, error "El nombre no genera una clave válida, probá con otro".
  - Validá: `label` obligatorio. `type` uno de los 6 valores válidos. Si
    `type = SELECT`, parseá `options` por línea, recortá espacios, sacá
    líneas vacías, y exigí al menos 1 opción no vacía.
  - **Colisión de key**: si el `key` generado coincide con alguna key de la
    plantilla FIJA de la vertical del tenant (`getClientFieldTemplate`), o
    con un `TenantClientField` ya existente de ese tenant (activo O
    inactivo — el `@@unique([tenantId, key])` lo va a rechazar a nivel de
    base igual, pero validalo antes con un mensaje claro), bloqueá con un
    error explicando que ya existe un campo con esa clave. Si el que
    colisiona es un `TenantClientField` inactivo del mismo tenant, sugerí
    reactivarlo en vez de crear uno nuevo (mismo criterio que usa el
    proyecto en otros lados para colisiones de unicidad, ej. email
    duplicado en Equipo).
  - `order` = (máximo `order` actual del tenant) + 1, o 0 si no tiene
    ninguno todavía.
  - Redirige a la lista con éxito.

- `updateClientFieldAction(tenantSlug, fieldId, formData)` — permite editar
  `label`, `options` (si type = SELECT), y `active`. **El `type` y el `key`
  NO son editables una vez creado** — si el tenant quiere cambiar el tipo de
  dato, tiene que desactivar este campo y crear uno nuevo con otra clave
  (evita dejar datos ya guardados bajo un tipo que ya no coincide con el
  form). Mismo patrón de validación que crear (label obligatorio, opciones
  si aplica). Filtrá por `tenantId` además del id al buscar el campo (no
  confiar en el id de la URL).

`src/app/dashboard/[tenantSlug]/client-fields/page.tsx` — lista de campos
del tenant (activos e inactivos, con badge), ordenados por `order`, con
link "+ Nuevo campo".

`src/app/dashboard/[tenantSlug]/client-fields/new/page.tsx` — form de crear.

`src/app/dashboard/[tenantSlug]/client-fields/[fieldId]/page.tsx` — form de
editar (mostrando el tipo como texto fijo, no editable, y la clave interna
en modo lectura/monospace como referencia).

**No hay borrado real** — mismo criterio que Servicios/Profesionales/Sedes/
Inventario: solo `active`. Desactivar un campo lo saca de
`getEffectiveClientFieldTemplate` (no se renderiza más ni se puede editar en
ningún cliente, nuevo o existente), pero los datos que ya estén guardados
bajo esa key en `Client.customFields` de clientes existentes NO se borran
— simplemente dejan de mostrarse. Reactivarlo los vuelve a mostrar tal cual
estaban.

No hay reordenamiento manual (drag and drop, etc.) en esta fase — el orden
es simplemente el orden de creación.

### 4. Nav

Agregá `{ href: \`/dashboard/${tenantSlug}/client-fields\`, label: "Campos de ficha",
show: hasReportsAccess }` a `src/app/dashboard/[tenantSlug]/layout.tsx`
(misma variable ya existente, representa OWNER/ADMIN).

## Qué NO hacer

- No permitas ocultar, editar, ni reordenar los campos FIJOS de la plantilla
  de vertical (`CLIENT_FIELD_TEMPLATES`) — esos siguen totalmente intactos,
  no tocás `clientFieldTemplates.ts` salvo para AGREGAR la función nueva.
- No toques `ClientForm.tsx` ni `buildCustomFields` en `clients/actions.ts`
  — ya son genéricos, no necesitan cambios.
- No permitas editar el `type` ni el `key` de un `TenantClientField` ya
  creado.
- No implementes borrado real de campos personalizados, solo `active`.
- No agregues reordenamiento manual (drag-and-drop) — el orden es el de
  creación.
- No atés los campos personalizados a la vertical del tenant — son del
  tenant entero, sin importar su `vertical`.
- No agregues gating de plan a esta función.
- No toques `CLAUDE.md` — de eso me encargo yo.

## Verificación

1. Corré la migración y confirmá en Prisma Studio que `TenantClientField` se
   creó bien relacionado a `Tenant`.
2. Como OWNER/ADMIN, creá un campo personalizado de tipo texto (ej. "Alergia
   a mariscos") para un tenant de prueba: confirmá que aparece en el
   formulario de crear/editar cliente, DESPUÉS de los campos fijos de la
   vertical de ese tenant.
3. Creá uno de tipo `SELECT` con 3 opciones (una por línea): confirmá que el
   `<select>` se renderiza con esas 3 opciones en el form de cliente.
4. Guardá un cliente con datos en ambos campos (fijo y personalizado):
   confirmá en Prisma Studio que `Client.customFields` tiene AMBAS keys
   (la fija de la plantilla y la del campo personalizado) en el mismo JSON.
5. Probá crear un campo cuya key generada colisione con una key fija de la
   plantilla de esa vertical (ej. en un tenant PSICOLOGIA, un campo llamado
   literalmente "Diagnostico Cie10"): confirmá que se bloquea con un
   mensaje claro, sin crear nada.
6. Desactivá el campo personalizado creado en el paso 2: confirmá que deja
   de aparecer en el form de cliente (nuevo y al editar uno existente), pero
   que el cliente del paso 4 sigue teniendo ese valor guardado en
   `Client.customFields` en la base (no se borró). Reactivalo y confirmá que
   vuelve a aparecer con el valor previamente guardado.
7. Confirmá que un usuario STAFF (sin OWNER/ADMIN) recibe 404 al intentar
   entrar a `/client-fields`.
8. Confirmá que los tests existentes siguen pasando y que la ficha de
   cliente para un tenant SIN ningún campo personalizado se ve exactamente
   igual que antes de esta fase (sin regresión para tenants que no usan la
   función nueva).

Contame qué verificaste en vivo, no solo qué escribiste.
