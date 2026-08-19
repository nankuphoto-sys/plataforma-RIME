import Link from "next/link";
import { ArrowLeft, MapPinPlus } from "lucide-react";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createLocationAction } from "../actions";

export default async function NewLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  await requireOwnerAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/locations`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a sedes
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Nueva sede</h1>

      <form action={createLocationAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="address">
            Dirección
          </label>
          <input id="address" name="address" type="text" className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="timezone">
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            defaultValue="America/Bogota"
            className="field-input"
          />
        </div>

        <SubmitButton icon={<MapPinPlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear sede
        </SubmitButton>
      </form>
    </div>
  );
}
