# Fix: acceso automático de OWNER a sedes nuevas

Hueco documentado en `CLAUDE.md` (Fase 5, multi-sede): hoy, al crear una
sede nueva desde `/dashboard/[tenantSlug]/locations/new`, ningún usuario
queda con `StaffLocationRole` sobre ella — ni siquiera el OWNER que la creó.
Hay que asignarlo a mano vía Prisma Studio, lo cual es un hueco real de
usabilidad (el propio OWNER queda sin poder gestionar la sede que acaba de
crear).

## Fix

En `createLocationAction`
(`src/app/dashboard/[tenantSlug]/locations/actions.ts`): al crear la
`Location`, dale automáticamente rol `OWNER` a **todo usuario que ya tenga
`StaffLocationRole` con `role: "OWNER"` en cualquier otra sede de ese
mismo tenant** — no solo al usuario de la sesión actual, por si el tenant
tiene más de un OWNER. Hazlo dentro de la misma transacción que crea la
sede, para que nunca quede una sede creada sin al menos sus OWNERs con
acceso:

```ts
export async function createLocationAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const { name, address, timezone } = parseLocationFields(formData);
  if (!name) {
    redirect(`/dashboard/${tenantSlug}/locations/new?error=${encodeURIComponent("El nombre es obligatorio.")}`);
  }

  const ownerUserIds = await prisma.staffLocationRole.findMany({
    where: { role: "OWNER", location: { tenantId: tenant.id } },
    select: { userId: true },
    distinct: ["userId"],
  });

  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({ data: { tenantId: tenant.id, name, address, timezone } });
    if (ownerUserIds.length > 0) {
      await tx.staffLocationRole.createMany({
        data: ownerUserIds.map((o) => ({ userId: o.userId, locationId: created.id, role: "OWNER" as const })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  revalidatePath(`/dashboard/${tenantSlug}/locations`);
  redirect(`/dashboard/${tenantSlug}/locations/${location.id}`);
}
```

Ajusta nombres/estilo si algo no calza exactamente con el archivo actual,
pero la lógica debe ser esa: buscar los `userId` con rol OWNER en cualquier
sede del tenant, y crearles `StaffLocationRole` (`role: "OWNER"`) en la
sede nueva, dentro de la misma transacción que la crea.

## Qué NO hacer

- No toques la gestión de `StaffLocationRole` en general (invitar
  usuarios, asignar ADMIN/STAFF/PROFESSIONAL a una sede) — eso sigue fuera
  de scope, este fix es solo para el caso OWNER + sede nueva.
- No toques `updateLocationAction` ni
  `updateLocationProfessionalsAction`.
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar.

## Verificación

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` limpios.
- Prueba manual: crea una sede nueva como OWNER y confirma en Prisma
  Studio que quedó una fila `StaffLocationRole` (`role: OWNER`) para ese
  usuario apuntando a la sede recién creada — sin tener que asignarla a
  mano. Si el tenant demo tiene un solo OWNER, alcanza con confirmar eso;
  si quieres, prueba también que un segundo usuario OWNER (si existe)
  también queda con acceso.
