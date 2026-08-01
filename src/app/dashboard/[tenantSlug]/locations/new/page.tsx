import Link from "next/link";
import { requireOwnerAccess } from "@/lib/auth-guards";
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
      <Link href={`/dashboard/${tenantSlug}/locations`} className="shell-link">
        ← Volver a sedes
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
            defaultValue="America/Santiago"
            className="field-input"
          />
        </div>

        <button type="submit" className="btn-primary">
          Crear sede
        </button>
      </form>
    </div>
  );
}
