import Link from "next/link";
import { ArrowLeftRight, PackagePlus, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations, hasLocationAccess } from "@/lib/authorization";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateLowStockAlertPhoneAction } from "./actions";

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ locationId?: string; error?: string; alertPhoneSaved?: string }>;
}) {
  const { tenantSlug } = await params;
  const { locationId, error, alertPhoneSaved } = await searchParams;
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
            <PackagePlus className="h-4 w-4" />
            Nuevo ítem
          </Link>
        )}
      </div>

      {error && <p className="msg-error mt-3">{error}</p>}
      {alertPhoneSaved && !error && <p className="msg-success mt-3">Preferencia de alertas guardada.</p>}

      {hasInventoryManageAccess && (
        <div className="mt-6 border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Alertas de stock bajo por WhatsApp</p>
          <p className="mt-1 text-sm text-ink/60">
            Cuando una salida de inventario deja un ítem en su umbral de stock bajo o por debajo, se
            avisa por WhatsApp a este número. Dejalo vacío para desactivar las alertas.
          </p>
          <form
            action={updateLowStockAlertPhoneAction.bind(null, tenantSlug)}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input
              type="tel"
              name="lowStockAlertPhone"
              placeholder="+57 300 123 4567"
              defaultValue={tenant.lowStockAlertPhone ?? ""}
              className="field-input mt-0 w-64"
            />
            <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…" className="btn-secondary">
              Guardar
            </SubmitButton>
          </form>
        </div>
      )}

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
            <ArrowLeftRight className="h-4 w-4" />
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
