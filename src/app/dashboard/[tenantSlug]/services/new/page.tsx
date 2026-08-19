import Link from "next/link";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { requireServicesManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
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
      <Link href={`/dashboard/${tenantSlug}/services`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a servicios
        <LinkPendingSpinner />
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
            className="field-input"
          />
          <p className="mt-1 text-xs text-ink/45">
            Si lo dejas vacío, se usa el % de comisión de cada profesional. Si lo llenas, este
            servicio siempre paga ese % sin importar quién lo haga.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked className="field-checkbox" />
          Activo
        </label>

        <SubmitButton icon={<ClipboardPlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear servicio
        </SubmitButton>
      </form>
    </div>
  );
}
