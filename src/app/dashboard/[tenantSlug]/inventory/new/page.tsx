import Link from "next/link";
import { requireInventoryManageAccess } from "@/lib/auth-guards";
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
      <Link href={`/dashboard/${tenantSlug}/inventory`} className="shell-link">
        ← Volver a inventario
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

        <button type="submit" className="btn-primary">
          Crear ítem
        </button>
      </form>
    </div>
  );
}
