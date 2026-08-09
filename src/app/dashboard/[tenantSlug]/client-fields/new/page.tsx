import Link from "next/link";
import { ArrowLeft, ListPlus } from "lucide-react";
import { requireClientFieldsManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
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
      <Link href={`/dashboard/${tenantSlug}/client-fields`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a campos de ficha
        <LinkPendingSpinner />
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

        <SubmitButton icon={<ListPlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear campo
        </SubmitButton>
      </form>
    </div>
  );
}
