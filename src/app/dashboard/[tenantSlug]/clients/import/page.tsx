import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { ImportWizard } from "./ImportWizard";

export default async function ImportClientsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Mismo chequeo que createClientAction/parseCsvPreviewAction: mejor no
  // mostrar el formulario a alguien que igual va a ser bloqueado al
  // confirmar la importación.
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  if (isProfessionalOnly) {
    redirect(
      `/dashboard/${tenantSlug}/clients?error=${encodeURIComponent(
        "No tienes permiso para importar clientes. Pídele a recepción o a tu administrador que lo haga."
      )}`
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a clientes
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Importar clientes desde CSV</h1>
      <p className="page-subtitle">
        Sube un archivo .csv con tus clientes (nombre, email y teléfono). Si un cliente ya existe (mismo email o
        teléfono), se omite en vez de duplicarlo. Solo se admite CSV — un archivo de Excel exportado como CSV
        (Archivo → Guardar como → CSV) cubre el mismo caso de uso.
      </p>

      <ImportWizard tenantSlug={tenantSlug} />
    </div>
  );
}
