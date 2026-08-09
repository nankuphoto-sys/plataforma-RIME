import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireServicesManageAccess } from "@/lib/auth-guards";
import { planIncludesModule } from "@/lib/planLimits";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateServiceAction, updateServiceInventoryItemsAction } from "../actions";

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; serviceId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, serviceId } = await params;
  const { error, saved } = await searchParams;
  const { tenant } = await requireServicesManageAccess(tenantSlug);

  // Filtramos por tenantId además del id: no confiar en el id de la URL solo.
  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: tenant.id },
  });
  if (!service) notFound();

  const hasInventoryModule = planIncludesModule(tenant.plan, "inventory");
  const inventoryItems = hasInventoryModule
    ? await prisma.inventoryItem.findMany({
        where: { tenantId: tenant.id, active: true },
        include: { serviceLinks: { where: { serviceId: service.id } } },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/services`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a servicios
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{service.name}</h1>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <form action={updateServiceAction.bind(null, tenantSlug, serviceId)} className="mt-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={service.name}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="durationMinutes">
            Duración (minutos)
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={service.durationMinutes}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="price">
            Precio
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={Number(service.price)}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="commissionRate">
            % Comisión (opcional)
          </label>
          <input
            id="commissionRate"
            name="commissionRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="Usa el % del profesional"
            defaultValue={service.commissionRate !== null ? Number(service.commissionRate).toString() : ""}
            className="field-input"
          />
          <p className="mt-1 text-xs text-ink/45">
            Si lo dejás vacío, se usa el % de comisión de cada profesional. Si lo llenás, este
            servicio siempre paga ese % sin importar quién lo haga.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service.active}
            className="field-checkbox"
          />
          Activo
        </label>

        <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </form>

      {hasInventoryModule && (
        <div className="mt-6 border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Insumos</p>
          <p className="mt-1 text-sm text-ink/60">
            Cuánto consume UNA cita completada de este servicio — se descuenta automáticamente de la
            sede de la cita al marcarla como completada.
          </p>

          {inventoryItems.length === 0 ? (
            <p className="mt-3 text-sm text-ink/40">Este negocio todavía no tiene insumos activos.</p>
          ) : (
            <form
              action={updateServiceInventoryItemsAction.bind(null, tenantSlug, serviceId)}
              className="mt-3 space-y-3"
            >
              {inventoryItems.map((item) => {
                const link = item.serviceLinks[0];
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="itemIds"
                        value={item.id}
                        defaultChecked={Boolean(link)}
                        className="field-checkbox"
                      />
                      {item.name} <span className="text-ink/40">({item.unit})</span>
                    </label>
                    <input
                      type="number"
                      name={`quantity_${item.id}`}
                      min="1"
                      step="1"
                      defaultValue={link?.quantityPerUse ?? 1}
                      className="field-input mt-0 w-24"
                    />
                  </div>
                );
              })}
              <SubmitButton
                icon={<Save className="h-4 w-4" />}
                pendingLabel="Guardando…"
                className="btn-secondary"
              >
                Guardar insumos
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
