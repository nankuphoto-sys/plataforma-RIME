import Link from "next/link";
import { requireServicesManageAccess } from "@/lib/auth-guards";
import { createServiceAction } from "../actions";

export default async function NewServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  await requireServicesManageAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/services`} className="shell-link">
        ← Volver a servicios
      </Link>
      <h1 className="page-title mt-3">Nuevo servicio</h1>

      <form action={createServiceAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required className="field-input" />
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
            defaultValue={0}
            required
            className="field-input"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked className="field-checkbox" />
          Activo
        </label>

        <button type="submit" className="btn-primary">
          Crear servicio
        </button>
      </form>
    </div>
  );
}
