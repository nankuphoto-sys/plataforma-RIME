import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { requireInventoryManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createInventoryItemAction } from "../actions";

export default async function NewInventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  await requireInventoryManageAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/inventory`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a inventario
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Nuevo ítem de inventario</h1>

      <form action={createInventoryItemAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="unit">
            Unidad
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            placeholder="unidad, ml, g, caja..."
            required
            className="field-input"
          />
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
            defaultValue={0}
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
            placeholder="Sin costo cargado"
            className="field-input"
          />
          <p className="mt-1 text-xs text-ink/45">Se usa para valorizar el consumo en el reporte de inventario.</p>
        </div>

        <SubmitButton icon={<PackagePlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear ítem
        </SubmitButton>
      </form>
    </div>
  );
}
