import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownUp, ArrowLeft, ArrowLeftRight, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations, hasLocationAccess } from "@/lib/authorization";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { recordInventoryMovementAction, updateInventoryItemAction } from "../actions";

function formatMovementDate(date: Date): string {
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export default async function InventoryItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; itemId: string }>;
  searchParams: Promise<{ locationId?: string; error?: string; saved?: string }>;
}) {
  const { tenantSlug, itemId } = await params;
  const { locationId, error, saved } = await searchParams;
  const { session, tenant } = await requireInventoryAccess(tenantSlug);

  // Filtramos por tenantId además del id: no confiar en el id de la URL solo.
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, tenantId: tenant.id } });
  if (!item) notFound();

  const hasInventoryManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );

  // Mismo patrón de selector de sede que la lista de inventario y la agenda
  // interna: sedes accesibles al usuario, ordenadas por antigüedad.
  const accessibleLocations = tenant.locations
    .filter((loc) => hasLocationAccess(session.user.locationRoles, loc.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const requestedLocation = locationId
    ? accessibleLocations.find((loc) => loc.id === locationId)
    : undefined;
  const location = requestedLocation ?? accessibleLocations[0];

  if (!location) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="page-title">{item.name}</h1>
        <p className="mt-6 text-sm text-ink/40">
          Este negocio todavía no tiene una sede a la que tengas acceso.
        </p>
      </div>
    );
  }

  const [stock, recentMovements] = await Promise.all([
    prisma.inventoryStock.findUnique({
      where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
    }),
    prisma.inventoryMovement.findMany({
      where: { itemId: item.id, locationId: location.id },
      include: { createdByUser: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const quantity = stock?.quantity ?? 0;
  const isNegative = quantity < 0;
  const isLowStock = !isNegative && quantity <= item.lowStockThreshold;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/inventory`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a inventario
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{item.name}</h1>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

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

      <section className="panel mt-6">
        <p className="text-sm font-medium text-ink/70">Stock en {location.name}</p>
        <p className="data-mono mt-1 text-2xl font-semibold text-ink">
          {quantity} <span className="font-sans text-sm font-normal text-ink/50">{item.unit}</span>
        </p>
        {isNegative && <span className="badge badge-berry mt-2">Stock negativo</span>}
        {isLowStock && (
          <span className="badge badge-berry mt-2">Stock bajo (umbral: {item.lowStockThreshold})</span>
        )}
        {item.unitCost !== null && (
          <p className="mt-2 text-xs text-ink/45">Costo: {Number(item.unitCost).toFixed(2)} / {item.unit}</p>
        )}
      </section>

      {hasInventoryManageAccess && (
        <section className="mt-6 border-t border-sage-dark/30 pt-6">
          <h2 className="section-title">Editar ítem</h2>
          <form
            action={updateInventoryItemAction.bind(null, tenantSlug, itemId)}
            className="mt-4 space-y-4"
          >
            <div>
              <label className="field-label" htmlFor="name">
                Nombre
              </label>
              <input id="name" name="name" type="text" required defaultValue={item.name} className="field-input" />
            </div>
            <div>
              <label className="field-label" htmlFor="unit">
                Unidad
              </label>
              <input id="unit" name="unit" type="text" required defaultValue={item.unit} className="field-input" />
            </div>
            <div>
              <label className="field-label" htmlFor="lowStockThreshold">
                Umbral de stock bajo
              </label>
              <input
                id="lowStockThreshold"
                name="lowStockThreshold"
                type="number"
                min="0"
                step="1"
                defaultValue={item.lowStockThreshold}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="unitCost">
                Costo por unidad (opcional)
              </label>
              <input
                id="unitCost"
                name="unitCost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={item.unitCost !== null ? item.unitCost.toString() : ""}
                placeholder="Sin costo cargado"
                className="field-input"
              />
              <p className="mt-1 text-xs text-ink/45">
                Se usa para valorizar el consumo en el reporte de inventario.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={item.active} className="field-checkbox" />
              Activo
            </label>
            <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…">
              Guardar
            </SubmitButton>
          </form>
        </section>
      )}

      <section className="mt-6 border-t border-sage-dark/30 pt-6">
        <h2 className="section-title">Registrar movimiento en {location.name}</h2>
        <form
          action={recordInventoryMovementAction.bind(null, tenantSlug, itemId)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="locationId" value={location.id} />
          <div>
            <label className="field-label" htmlFor="type">
              Tipo
            </label>
            <select id="type" name="type" className="field-input mt-1">
              <option value="IN">Entrada</option>
              <option value="OUT">Salida</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="quantity">
              Cantidad
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min="1"
              step="1"
              required
              className="field-input w-28"
            />
          </div>
          <div className="flex-1">
            <label className="field-label" htmlFor="note">
              Nota (opcional)
            </label>
            <input id="note" name="note" type="text" className="field-input" />
          </div>
          <SubmitButton icon={<ArrowDownUp className="h-4 w-4" />} pendingLabel="Registrando…">
            Registrar
          </SubmitButton>
        </form>
      </section>

      <section className="mt-6 border-t border-sage-dark/30 pt-6">
        <h2 className="section-title">Últimos movimientos en {location.name}</h2>
        {recentMovements.length === 0 ? (
          <p className="mt-3 text-sm text-ink/40">Todavía no hay movimientos registrados en esta sede.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {recentMovements.map((movement) => (
              <li
                key={movement.id}
                className="flex items-center justify-between border-b border-sage-dark/20 py-2"
              >
                <div>
                  <span
                    className={`data-mono font-medium ${
                      movement.type === "IN" ? "text-pine-dark" : "text-berry-dark"
                    }`}
                  >
                    {movement.type === "IN" ? "+" : "-"}
                    {movement.quantity} {item.unit}
                  </span>
                  {movement.appointmentId ? (
                    <span className="badge badge-sage ml-2">Automático — cita completada</span>
                  ) : (
                    movement.note && <span className="ml-2 text-ink/50">{movement.note}</span>
                  )}
                </div>
                <div className="text-right text-ink/45">
                  <div className="data-mono">{formatMovementDate(movement.createdAt)}</div>
                  {movement.createdByUser && <div>{movement.createdByUser.name}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
