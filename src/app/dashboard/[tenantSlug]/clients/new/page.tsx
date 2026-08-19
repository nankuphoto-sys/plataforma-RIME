import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserPlus } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
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
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Mismo chequeo que createClientAction: mejor no mostrar el formulario a
  // alguien que igual va a ser bloqueado al enviarlo (ver el comentario ahí
  // para el motivo — "solo lo mío" dejaría el cliente creado invisible).
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  if (isProfessionalOnly) {
    redirect(
      `/dashboard/${tenantSlug}/clients?error=${encodeURIComponent(
        "No tienes permiso para crear clientes nuevos. Pídele a recepción o a tu administrador que lo haga."
      )}`
    );
  }

  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a clientes
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Nuevo cliente</h1>

      <ClientForm
        fieldTemplate={fieldTemplate}
        action={createClientAction.bind(null, tenantSlug)}
        submitLabel="Crear cliente"
        submitIcon={<UserPlus className="h-4 w-4" />}
        errorMessage={error}
      />
    </div>
  );
}
