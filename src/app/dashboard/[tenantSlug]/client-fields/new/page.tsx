import Link from "next/link";
import { requireClientFieldsManageAccess } from "@/lib/auth-guards";
import { createClientFieldAction } from "../actions";

const TYPE_OPTIONS = [
  { value: "TEXT", label: "Texto" },
  { value: "TEXTAREA", label: "Texto largo" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Fecha" },
  { value: "SELECT", label: "Lista de opciones" },
  { value: "BOOLEAN", label: "Sí/No" },
] as const;

export default async function NewClientFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  await requireClientFieldsManageAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/client-fields`} className="shell-link">
        ← Volver a campos de ficha
      </Link>
      <h1 className="page-title mt-3">Nuevo campo</h1>

      <form action={createClientFieldAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="label">
            Nombre
          </label>
          <input id="label" name="label" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="type">
            Tipo
          </label>
          <select id="type" name="type" defaultValue="TEXT" className="field-input">
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="options">
            Opciones (una por línea, solo para &quot;Lista de opciones&quot;)
          </label>
          <textarea id="options" name="options" rows={4} className="field-input" />
        </div>

        <button type="submit" className="btn-primary">
          Crear campo
        </button>
      </form>
    </div>
  );
}
