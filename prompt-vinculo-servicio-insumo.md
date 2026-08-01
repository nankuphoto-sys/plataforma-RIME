# Prompt: Vínculo servicio↔insumo con descuento automático de stock

## Contexto

Ya existen, sin tocarlos en esta fase: `Service` (catálogo tenant-wide, gestión
en `src/app/dashboard/[tenantSlug]/services/`), y el módulo de Inventario
(`InventoryItem`/`InventoryStock`/`InventoryMovement`, gestión en
`src/app/dashboard/[tenantSlug]/inventory/`, gateado por
`planIncludesModule(tenant.plan, "inventory")` — hoy solo PREMIUM/PRO). El
registro manual de un movimiento (`recordInventoryMovementAction` en
`inventory/actions.ts`) tiene una regla ya probada en producción: una salida
(`OUT`) que supere el stock actual se rechaza siempre, sin crear nada.

Esta fase agrega: (1) poder vincular insumos a un `Service` con una cantidad
fija por uso (ej. "1 sesión de depilación láser consume 2 unidades de gel + 1
toalla desechable"), y (2) al marcar una cita como `COMPLETED` desde
`updateAppointmentStatusAction`
(`src/app/dashboard/[tenantSlug]/actions.ts`), descontar automáticamente ese
stock en la sede de esa cita (`Appointment.locationId`).

**Decisión de producto ya tomada — no la vuelvas a plantear ni la cuestiones:**
la cita SIEMPRE se puede completar, sin importar el estado del stock. Se llegó
a esto después de debatir explícitamente tres posturas (bloquear la
transición, permitir y dejar en negativo, permitir topando en 0) con
razonamiento especializado desde tres ángulos (integridad de datos, operación
real de un consultorio chico, arquitectura de software a largo plazo). Ganó
"permitir siempre, dejar en negativo si hace falta", por dos razones que ya
son principios establecidos en este proyecto: (a) el proyecto ya decidió antes
que `Appointment.status` es una fuente de verdad independiente de sistemas
auxiliares — la comisión se calcula sobre citas `COMPLETED` sin importar el
estado del pago, precisamente "para que funcione igual en negocios que cobran
en efectivo"; bloquear el cierre de una cita por inventario rompería ese mismo
principio de independencia; (b) topar en 0 (la tercera postura) es la peor
opción real: esconde silenciosamente que hubo un consumo mayor al registrado,
lo que contamina cualquier reporte futuro de consumo sin que nadie lo note. Un
stock negativo, en cambio, es una señal honesta y ya visible: `InventoryItem`
usa `isLowStock = quantity <= lowStockThreshold` en
`inventory/[itemId]/page.tsx`, así que cualquier negativo ya dispara el badge
de "Stock bajo" existente sin cambios adicionales — aunque sí pedimos abajo un
tratamiento visual distinto para negativo, ver punto 5.

**Otra decisión ya tomada:** si el `InventoryItem` vinculado todavía no tiene
ninguna fila de `InventoryStock` para la sede de la cita (caso común: alguien
vincula el insumo al servicio antes de cargar el stock inicial de esa sede),
no falles — creá la fila en el momento, con el resultado que corresponda
(puede quedar negativa directamente). No es un caso de "sin stock suficiente",
es simplemente configuración incompleta que no debe romper el flujo.

**Otra decisión ya tomada:** el módulo de insumos por servicio hereda el mismo
gating de plan que el resto de Inventario. Si `tenant.plan` no incluye
`"inventory"` (`planIncludesModule`), la sección de insumos no debe aparecer
en la edición del servicio, Y el descuento automático al completar una cita
debe saltarse por completo (ni se intenta, ni genera movimientos) — mismo
criterio que ya sigue `detect-inactive-clients` con el módulo `reengagement`
("un tenant sin el módulo ni se escanea ni cuenta"). Esto aplica incluso si el
tenant tiene links de `ServiceInventoryItem` configurados de una fase anterior
con un plan superior: mientras el plan actual no incluya `"inventory"`, el
descuento no corre (no se borran los links, solo no se aplican).

**Nota de correctitud, no es algo que tengas que resolver:** `COMPLETED` es un
estado terminal (`ALLOWED_STATUS_TRANSITIONS.COMPLETED = []` en
`src/lib/appointmentStatus.ts`) — una cita entra a `COMPLETED` como máximo una
vez en su vida, nunca hay forma de salir y volver a entrar. Por eso no hace
falta ningún guard de idempotencia/deduplicación para el descuento: no puede
dispararse dos veces para la misma cita.

## Qué hacer

### 1. Migración de Prisma

Nuevo modelo, tenant-wide (igual que `Service`, no por sede):

```prisma
model ServiceInventoryItem {
  serviceId      String
  service        Service       @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  itemId         String
  item           InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantityPerUse Int // siempre positivo — cuánto consume UNA cita completada de este servicio

  @@id([serviceId, itemId])
  @@index([itemId])
}
```

Agregá las relaciones inversas (`Service.inventoryItems`,
`InventoryItem.serviceLinks`).

Además, `InventoryMovement` gana un campo nuevo, espejo de cómo
`NotificationQueue` ya tiene `clientId` opcional junto a `appointmentId` (fase
de CRM predictivo): `appointmentId String?` + relación a `Appointment`
(`onDelete: SetNull` para no romper el historial de movimientos si la cita se
borrara alguna vez, aunque hoy no hay borrado de citas). Agregá también la
relación inversa `Appointment.inventoryMovements InventoryMovement[]`. Un
movimiento manual (vía `recordInventoryMovementAction`) sigue teniendo
`appointmentId: null`; un movimiento automático de esta fase siempre lo trae
seteado — así se pueden distinguir sin ambigüedad.

### 2. Lógica de descuento — `src/lib/inventory.ts` (archivo nuevo)

Función exportada, pensada para correr dentro de una transacción Prisma ya
abierta por quien la llama:

```ts
export async function deductInventoryForCompletedAppointment(
  tx: Prisma.TransactionClient,
  params: { serviceId: string; locationId: string; appointmentId: string; performedByUserId: string }
): Promise<void> { ... }
```

Por cada `ServiceInventoryItem` de `params.serviceId`:
- `tx.inventoryStock.upsert` sobre `{ itemId_locationId: { itemId, locationId: params.locationId } }`:
  `create: { itemId, locationId: params.locationId, quantity: -quantityPerUse }`,
  `update: { quantity: { decrement: quantityPerUse } }` — usá el `decrement`
  atómico de Prisma, no leas el valor actual primero ni valides contra él (a
  diferencia de `recordInventoryMovementAction`, acá nunca bloqueamos, así que
  no hace falta el read-then-check y el decrement atómico es además más
  seguro ante concurrencia).
- `tx.inventoryMovement.create` con `type: "OUT"`, `quantity: quantityPerUse`
  (siempre positivo, respeta la convención ya existente de que el signo lo da
  `type` y no el número), `note: "Consumo automático — cita completada"`,
  `appointmentId: params.appointmentId`, `createdByUserId: params.performedByUserId`
  (registrá a quien completó la cita, no lo dejes `null` — es información
  real y útil, igual de válida que en un movimiento manual).

### 3. Enganchar el descuento — `updateAppointmentStatusAction`
(`src/app/dashboard/[tenantSlug]/actions.ts`)

Envolvé el `prisma.appointment.update` ya existente junto con la llamada
condicional a `deductInventoryForCompletedAppointment` dentro de un único
`prisma.$transaction(async (tx) => { ... })` (por atomicidad — no por
bloqueo: si algo de la parte de inventario fallara de forma inesperada, no
querés una cita completada sin su movimiento, pero la condición de negocio
en sí NUNCA bloquea, ver el punto de arriba).

La deducción solo corre si `nextStatus === "COMPLETED"` Y
`planIncludesModule(tenant.plan, "inventory")` es `true` — el `tenant` que
esta función ya consulta con `prisma.tenant.findUnique` trae `plan` sin
necesidad de tocar el `select` (no usa `select`, así que ya viene el campo
completo). Si el plan no incluye el módulo, no llames a la función en
absoluto (ni generes movimientos, ni falles).

### 4. Checklist de insumos en el servicio

Nueva sección en `services/[serviceId]/page.tsx`, visible solo si
`planIncludesModule(tenant.plan, "inventory")` (si no, no mostrar nada — no
hace falta redirigir a `plan-required`, es solo una sección oculta dentro de
una página que ya carga bien). Lista los `InventoryItem` `active: true` del
tenant, con un checkbox por ítem más un input numérico de cantidad por uso
(precargado con la `quantityPerUse` actual si ya está vinculado, o vacío/1 si
no). Nueva server action (puede vivir en `services/actions.ts`), gateada por
`requireServicesManageAccess` (igual que el resto de la página) MÁS un
chequeo explícito de `planIncludesModule(tenant.plan, "inventory")` (si no lo
incluye, redirigí a `plan-required?feature=inventario&requiredPlan=PREMIUM`,
mismo patrón que ya usan las otras rutas de inventario).

Set-replace transaccional de `ServiceInventoryItem` para ese `serviceId`
(mismo patrón que `applyProfessionalServicesUpdate` en
`professionals/actions.ts`): valida que cada `itemId` enviado pertenezca al
tenant y esté `active: true` antes de crearlo, borra los que ya no vienen
marcados, y valida que la cantidad de cada ítem marcado sea un entero >= 1
(si no, bloqueá el guardado completo con un mensaje de error, sin guardar
nada parcial — mismo criterio de validación que el resto del proyecto).

### 5. Visibilidad en la página de un ítem de inventario
(`inventory/[itemId]/page.tsx`)

Dos ajustes chicos:
- En la lista de "Últimos movimientos", si `movement.appointmentId` no es
  null, mostrá alguna marca visual de que es automático (ej. una etiqueta
  "Automático — cita completada" al lado o en vez del `note`) para
  diferenciarlo de un movimiento manual a simple vista.
- El stock puede quedar negativo ahora (antes nunca pasaba, porque los
  movimientos manuales siempre lo impedían). Agregá un tratamiento visual
  distinto para `quantity < 0` (ej. "Stock negativo" en vez de/además de
  "Stock bajo (umbral: N)") — es una situación distinta a simplemente estar
  por debajo del umbral, y el dueño del negocio debería poder distinguirlas
  de un vistazo.

## Qué NO hacer

- No bloquees nunca la transición a `COMPLETED` por falta de stock — es la
  decisión de producto ya tomada y debatida, no la reabras.
- No toques el comportamiento de `recordInventoryMovementAction` — un `OUT`
  manual que supere el stock actual se sigue rechazando exactamente igual que
  hoy. Esa regla es exclusiva de movimientos manuales; los automáticos de
  esta fase son la única excepción, y quedan siempre identificables por
  `appointmentId`.
- No agregues ningún campo de costo/moneda a `InventoryItem` ni a
  `ServiceInventoryItem` — fuera de alcance.
- No desvincules ni desactives automáticamente un `ServiceInventoryItem`
  cuando el `InventoryItem` asociado se desactiva — se puede seguir viendo y
  gestionando a mano, igual que el resto del proyecto no auto-limpia vínculos
  cuando algo se desactiva.
- No agregues gating de plan nuevo aparte del ya existente para
  `"inventory"` — la sección hereda ese mismo chequeo, no inventes uno nuevo.
- No toques `CLAUDE.md` — de eso me encargo yo.

## Verificación

1. Vinculá 2 insumos a un servicio con cantidades distintas (ej. 2 y 1),
   asegurate que ambos tengan stock suficiente en la sede de una cita de
   prueba, completá esa cita, y confirmá que el stock de ambos insumos bajó
   exactamente lo esperado en esa sede puntual (no en otra), y que se
   crearon dos `InventoryMovement` con `appointmentId` seteado al id de esa
   cita.
2. Repetí con un insumo sin stock suficiente en esa sede — confirmá que la
   cita se completa igual (sin ningún bloqueo ni error) y que el stock de
   ese insumo queda en negativo.
3. Vinculá un insumo que todavía no tiene ninguna fila de `InventoryStock`
   en la sede de la cita — completá la cita y confirmá que se crea la fila
   (en negativo si corresponde) en vez de romper con un error.
4. Confirmá que un servicio SIN insumos vinculados se sigue completando
   exactamente igual que antes de esta fase (sin ningún movimiento nuevo).
5. Confirmá que un movimiento manual de salida que supere el stock actual
   se sigue rechazando igual que siempre (no tocaste esa regla).
6. Con un tenant en un plan sin el módulo `"inventory"` (ej. BASICO): la
   sección de insumos no debe aparecer en la edición de un servicio, y
   completar una cita de un servicio que tuviera insumos vinculados de
   antes (podés simular esto en Prisma Studio) NO debe generar ningún
   movimiento ni tocar ningún stock.
7. Confirmá visualmente el tratamiento distinto para stock negativo vs.
   stock bajo, y que los movimientos automáticos se distinguen de los
   manuales en la lista de movimientos recientes.
8. Confirmá que los tests existentes siguen pasando.

Contame qué verificaste en vivo, no solo qué escribiste.
