import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientFieldsManageAccess } from "@/lib/auth-guards";
import { updateClientFieldAction } from "../actions";

const TYPE_LABELS: Record<string, string> = {
  TEXT: "Texto",
  TEXTAREA: "Texto largo",
  NUMBER: "Número",
  DATE: "Fecha",
  SELECT: "Lista de opciones",
  BOOLEAN: "Sí/No",
};

export default async function ClientFieldDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; fieldId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, fieldId } = await params;
  const { error, saved } = await searchParams;
  const { tenant } = await requireClientFieldsManageAccess(tenantSlug);

  // Filtramos por tenantId además del id: no confiar en el id de la URL solo.
  const field = await prisma.tenantClientField.findFirst({
    where: { id: fieldId, tenantId: tenant.id },
  });
  if (!field) notFound();

  const options = Array.isArray(field.options) ? (field.options as string[]) : [];

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/client-fields`} className="shell-link">
        ← Volver a campos de ficha
      </Link>
      <h1 className="page-title mt-3">{field.label}</h1>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <form action={updateClientFieldAction.bind(null, tenantSlug, fieldId)} className="mt-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="label">
            Nombre
          </label>
          <input
            id="label"
            name="label"
            type="text"
            required
            defaultValue={field.label}
            className="field-input"
          />
        </div>

        <div>
          <p className="field-label">Tipo</p>
          <p className="field-input bg-sage/10 text-ink/60">{TYPE_LABELS[field.type] ?? field.type}</p>
        </div>

        <div>
          <p className="field-label">Clave interna</p>
          <p className="field-input data-mono bg-sage/10 text-ink/60">{field.key}</p>
        </div>

        {field.type === "SELECT" && (
          <div>
            <label className="field-label" htmlFor="options">
              Opciones (una por línea)
            </label>
            <textarea
              id="options"
              name="options"
              rows={4}
              defaultValue={options.join("\n")}
              className="field-input"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={field.active} className="field-checkbox" />
          Activo
        </label>

        <button type="submit" className="btn-primary">
          Guardar
        </button>
      </form>
    </div>
  );
}
