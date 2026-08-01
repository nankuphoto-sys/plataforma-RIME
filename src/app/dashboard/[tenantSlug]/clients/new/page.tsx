import Link from "next/link";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { createClientAction } from "../actions";
import { ClientForm } from "../ClientForm";

export default async function NewClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const { tenant } = await requireDashboardAccess(tenantSlug);

  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="shell-link">
        ← Volver a clientes
      </Link>
      <h1 className="page-title mt-3">Nuevo cliente</h1>

      <ClientForm
        fieldTemplate={fieldTemplate}
        action={createClientAction.bind(null, tenantSlug)}
        submitLabel="Crear cliente"
        errorMessage={error}
      />
    </div>
  );
}
