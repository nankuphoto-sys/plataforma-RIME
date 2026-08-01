import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations, hasLocationAccess } from "@/lib/authorization";

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { tenantSlug } = await params;
  const { locationId } = await searchParams;
  const { session, tenant } = await requireInventoryAccess(tenantSlug);

  const hasInventoryManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );

  // Mismo patrón de selector de sede que la agenda interna
  // (src/app/dashboard/[tenantSlug]/page.tsx): sedes accesibles al usuario,
  // ordenadas por antigüedad, selector visible solo con 2+.
  const accessibleLocations = tenant.locations
    .filter((loc) => hasLocationAccess(session.user.locationRoles, loc.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const requestedLocation = locationId
    ? accessibleLocations.find((loc) => loc.id === locationId)
    : undefined;
  const location = requestedLocation ?? accessibleLocations[0];

  if (!location) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="page-title">Inventario</h1>
        <p className="mt-6 text-sm text-ink/40">Este negocio todavía no tiene una sede configurada.</p>
      </div>
    );
  }

  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: tenant.id, active: true },
    include: { stockLevels: { where: { locationId: location.id } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">{location.name}</p>
        </div>
        {hasInventoryManageAccess && (
          <Link href={`/dashboard/${tenantSlug}/inventory/new`} className="btn-primary">
            + Nuevo ítem
          </Link>
        )}
      </div>

      {accessibleLocations.length > 1 && (
        <form method="get" className="mt-4 flex items-end gap-2">
          <select name="locationId" defaultValue={location.id} className="field-input mt-0 w-auto">
            {accessibleLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Cambiar
          </button>
        </form>
      )}

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Unidad</th>
              <th className="table-head-cell">Stock en {location.name}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const quantity = item.stockLevels[0]?.quantity ?? 0;
              const isLowStock = quantity <= item.lowStockThreshold;
              return (
                <tr key={item.id} className="table-row">
                  <td className="table-cell">
                    <Link
                      href={`/dashboard/${tenantSlug}/inventory/${item.id}?locationId=${location.id}`}
                      className="font-medium text-ink hover:text-pine hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="table-cell-muted">{item.unit}</td>
                  <td className="table-cell">
                    <span className={`data-mono ${isLowStock ? "font-medium text-berry-dark" : "text-ink"}`}>
                      {quantity}
                    </span>
                    {isLowStock && <span className="badge badge-berry ml-2">Stock bajo</span>}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-row">
                  Este negocio todavía no tiene ítems de inventario.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
