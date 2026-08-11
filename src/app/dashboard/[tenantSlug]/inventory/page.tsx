import Link from "next/link";
import { ArrowLeftRight, MapPin, MessageCircle, Package, PackagePlus, Save, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations, hasLocationAccess } from "@/lib/authorization";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EmptyState } from "@/components/ui/EmptyState";
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
    include: {
      stockLevels: { where: { locationId: location.id } },
      serviceLinks: { include: { service: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl">
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

      {(hasInventoryManageAccess || accessibleLocations.length > 1) && (
        <div className="mt-6 flex flex-col gap-4">
          {hasInventoryManageAccess && (
            <div className="panel">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
                  aria-hidden
                >
                  <MessageCircle className="h-4 w-4" />
                </span>
                <p className="section-title text-sm">Alertas de stock bajo por WhatsApp</p>
              </div>
              <p className="mt-2 text-sm text-ink/60">
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
            <div className="panel">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
                  aria-hidden
                >
                  <MapPin className="h-4 w-4" />
                </span>
                <p className="section-title text-sm">Sede</p>
              </div>
              <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
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
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={Package} message="Este negocio todavía no tiene ítems de inventario." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const quantity = item.stockLevels[0]?.quantity ?? 0;
            const isLowStock = quantity <= item.lowStockThreshold;
            // Escala relativa al propio umbral del ítem (no un tope fijo
            // compartido) — así "24 litros" y "2 cajas" son comparables
            // como % de qué tan lejos están de su propia zona de alerta,
            // no como cantidades absolutas que no tienen la misma escala.
            const gaugeScale = Math.max(quantity, item.lowStockThreshold * 3, 1);
            const gaugePercent = Math.min(100, Math.round((quantity / gaugeScale) * 100));
            const services = item.serviceLinks.map((link) => link.service.name);

            return (
              <Link
                key={item.id}
                href={`/dashboard/${tenantSlug}/inventory/${item.id}?locationId=${location.id}`}
                className={`group flex flex-col gap-4 rounded-xl border border-l-4 bg-white p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg ${
                  isLowStock ? "border-berry/25 border-l-berry bg-berry/[0.03]" : "border-sage-dark/40 border-l-pine"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
                        isLowStock ? "bg-berry/10 text-berry-dark" : "bg-pine/10 text-pine-dark"
                      }`}
                      aria-hidden
                    >
                      <Package className="h-5 w-5" />
                    </span>
                    <p className="truncate text-base font-semibold text-ink group-hover:text-pine">{item.name}</p>
                  </div>
                  {isLowStock ? (
                    <span className="badge badge-berry flex-none">
                      <TriangleAlert className="mr-1 h-3 w-3" aria-hidden />
                      Stock bajo
                    </span>
                  ) : (
                    <span className="badge badge-pine flex-none">Con stock</span>
                  )}
                </div>

                <div>
                  <p className={`data-mono text-3xl font-semibold ${isLowStock ? "text-berry-dark" : "text-ink"}`}>
                    {quantity}
                    <span className="ml-1.5 text-sm font-normal text-ink/40">{item.unit}</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sage">
                    <div
                      className={`h-full rounded-full ${isLowStock ? "bg-berry" : "bg-pine"}`}
                      style={{ width: `${gaugePercent}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink/40">Alerta bajo {item.lowStockThreshold}</p>
                </div>

                {services.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-sage-dark/25 pt-3">
                    {services.map((name) => (
                      <span key={name} className="badge badge-sage">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {item.unitCost !== null && (
                  <p className="data-mono -mt-1 text-xs text-ink/50">
                    ${Number(item.unitCost).toLocaleString("es-CO")} / {item.unit}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
