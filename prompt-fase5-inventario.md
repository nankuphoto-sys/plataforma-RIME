# Fase 5: Inventario (insumos y productos, stock por sede)

Este prompt implementa el tercer y último bloque pendiente de la Fase 5 (ver
`CLAUDE.md`): un módulo de inventario desde cero. No existe ningún modelo de
inventario en el schema todavía.

Alcance decidido para esta primera versión (no lo cambies sin preguntar):

- Se controla tanto insumos que se consumen al dar un servicio como
  productos que se venden directo al cliente — para esta fase son lo mismo
  (un "ítem de inventario" con nombre, unidad y stock), sin distinguir tipo.
- El stock es **por sede** (`Location`), no tenant-wide.
- El descuento de stock es **manual** por ahora: no hay vínculo entre
  `Service`/`Appointment` e insumos, ni descuento automático al completar
  una cita. Eso queda fuera de esta fase.
- Las alertas de stock bajo son **solo visuales** en el dashboard (un
  indicador junto al ítem cuando su stock está en o por debajo del umbral
  configurado) — no hay WhatsApp ni ningún otro canal para esto.

## 1. Schema (`prisma/schema.prisma`)

```prisma
model InventoryItem {
  id                String   @id @default(cuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name              String
  unit              String   // texto libre: "unidad", "ml", "g", "caja", etc. — sin catálogo fijo
  lowStockThreshold Int      @default(0)
  active            Boolean  @default(true)
  createdAt         DateTime @default(now())

  stockLevels InventoryStock[]
  movements   InventoryMovement[]

  @@index([tenantId])
}

model InventoryStock {
  id         String        @id @default(cuid())
  itemId     String
  item       InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  locationId String
  location   Location      @relation(fields: [locationId], references: [id], onDelete: Cascade)
  quantity   Int           @default(0)

  @@unique([itemId, locationId])
  @@index([locationId])
}

model InventoryMovement {
  id              String                @id @default(cuid())
  itemId          String
  item            InventoryItem         @relation(fields: [itemId], references: [id], onDelete: Cascade)
  locationId      String
  location        Location              @relation(fields: [locationId], references: [id], onDelete: Cascade)
  type            InventoryMovementType
  quantity        Int                   // siempre positivo; el signo lo da `type`
  note            String?
  createdByUserId String?
  createdByUser   User?                 @relation(fields: [createdByUserId], references: [id])
  createdAt       DateTime              @default(now())

  @@index([itemId, locationId])
}

enum InventoryMovementType {
  IN
  OUT
}
```

Agrega las relaciones inversas que hagan falta para que el schema sea
válido: `Tenant.inventoryItems`, `Location.inventoryStock`,
`Location.inventoryMovements`, `User.inventoryMovements`.

Genera la migración con `npx prisma migrate dev --name add_inventory`
(recuerda: detén `npm run dev` y Prisma Studio antes, vuelve a levantar
`npm run dev` después). No hace falta backfill — es un módulo nuevo, no hay
datos previos que migrar.

## 2. Autorización

Dos niveles distintos, reutilizando lo que ya existe (no crees lógica de
autorización nueva, solo guards que la usen):

- **Ver el stock de una sede y registrar movimientos de entrada/salida**:
  cualquier usuario con acceso a esa sede (`hasLocationAccess`, ya existe en
  `src/lib/authorization.ts`) — un STAFF de recepción debe poder registrar
  "usé 2 unidades de X hoy" sin ser OWNER/ADMIN.
- **Crear o editar ítems del catálogo** (nombre, unidad, umbral de stock
  bajo): solo OWNER/ADMIN. Agrega un guard nuevo `requireInventoryManageAccess`
  en `src/lib/auth-guards.ts`, mismo patrón que `requireReportsAccess`
  (reutiliza `hasAnyOfRolesInTenantLocations` con `["OWNER", "ADMIN"]`).

## 3. Lógica de movimiento de stock (crítico, no la improvises)

Al registrar un movimiento (`recordInventoryMovementAction`), dentro de una
transacción:

1. Busca la fila `InventoryStock` para `(itemId, locationId)`. Si no existe,
   trátala como `quantity: 0` (créala si hace falta un upsert, o créala en
   el mismo paso que actualizas — lo que te resulte más simple).
2. Si `type === "OUT"` y la cantidad del movimiento es mayor al stock
   actual, no permitas el movimiento: devuelve un error ("No hay stock
   suficiente para registrar esta salida.") y no crees nada.
3. Si es válido: actualiza `InventoryStock.quantity` (suma si `IN`, resta si
   `OUT`) y crea la fila `InventoryMovement` correspondiente
   (`quantity` siempre positivo, el `type` da el signo), con
   `createdByUserId` del usuario de la sesión actual.

Valida siempre, antes de tocar la base de datos: que el `itemId` pertenece
al tenant, que el `locationId` pertenece al tenant, y que el usuario tiene
acceso a esa sede (`hasLocationAccess`) — nunca confíes en los ids que
llegan del formulario.

## 4. Páginas

Todas bajo `src/app/dashboard/[tenantSlug]/inventory/`:

- `page.tsx` — lista de ítems activos del tenant con su stock en la sede
  seleccionada. Usa el **mismo patrón de selector de sede** que ya existe en
  la agenda interna (`?locationId=`, sedes accesibles vía `hasLocationAccess`,
  selector solo visible con 2+ sedes accesibles, default a la primera sede
  accesible por antigüedad). No dupliques la lógica de forma distinta —
  cópiala/adáptala del patrón de `src/app/dashboard/[tenantSlug]/page.tsx`.
  Cada fila muestra nombre, unidad, cantidad en esa sede (0 si no tiene fila
  de stock todavía), y un indicador visual simple (por ejemplo texto/badge
  en rojo) si `quantity <= lowStockThreshold`. Link "+ Nuevo ítem" (solo
  visible con `requireInventoryManageAccess`).
- `new/page.tsx` — formulario para crear un `InventoryItem` (nombre, unidad,
  umbral de stock bajo), protegido por `requireInventoryManageAccess`.
- `[itemId]/page.tsx` — detalle del ítem: formulario de edición
  (nombre/unidad/umbral/activo, protegido por `requireInventoryManageAccess`),
  el stock actual en la sede seleccionada, un formulario simple para
  registrar un movimiento (tipo IN/OUT, cantidad, nota opcional — visible
  para cualquiera con acceso a esa sede, no solo OWNER/ADMIN), y debajo una
  lista de los últimos 10 movimientos de ese ítem en esa sede (más reciente
  primero).
- `actions.ts`:
  - `createInventoryItemAction` (`requireInventoryManageAccess`).
  - `updateInventoryItemAction` (`requireInventoryManageAccess`, valida
    `tenantId` antes de actualizar, igual que el resto de las actions de
    edición ya existentes).
  - `recordInventoryMovementAction` (accesible a cualquiera con
    `hasLocationAccess` sobre la sede indicada — no solo OWNER/ADMIN),
    implementando exactamente la lógica de la sección 3.

## 5. Link en el dashboard

En `src/app/dashboard/[tenantSlug]/page.tsx`, agrega un link "Inventario"
junto a los que ya existen (Clientes / Reportes / Sedes), visible para
**cualquier usuario con acceso al dashboard** (no lo restrinjas a
OWNER/ADMIN — la idea es que el STAFF también pueda entrar a registrar
movimientos). No cambies nada más de ese archivo.

## Qué NO hacer en este prompt (no te salgas de esto)

- No vincules `Service` con insumos ni descuentes stock automáticamente al
  completar una cita — es manual en esta fase.
- No agregues alertas por WhatsApp ni ningún otro canal para stock bajo —
  solo el indicador visual descrito arriba.
- No agregues borrado de ítems ni de movimientos (el campo `active` alcanza
  para "archivar" un ítem que ya no se usa).
- No agregues categorías, proveedores, costos/precios de insumos, ni
  reportes de consumo — fuera de esta fase.
- No toques reportes, CRM predictivo, ni ningún flujo de citas/pagos.
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
  flujo completo.

## Verificación antes de terminar

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — todos limpios.
- Prueba manual con login real: crea un ítem, registra una entrada (IN) de
  10 unidades en una sede, confirma que el stock se refleja correctamente
  en la lista y en el detalle. Registra una salida (OUT) mayor al stock
  disponible y confirma que el sistema la rechaza con un mensaje claro, sin
  modificar el stock. Registra una salida válida que deje el stock en o
  por debajo del umbral configurado y confirma que aparece el indicador de
  stock bajo. Si el tenant demo tiene 2 sedes, confirma que el mismo ítem
  puede tener stock distinto (o inexistente) en cada una.
