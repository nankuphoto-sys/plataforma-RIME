import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { updateLocationAndProfessionalsAction } from "../actions";

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; locationId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, locationId } = await params;
  const { error, saved } = await searchParams;
  const { tenant } = await requireOwnerAccess(tenantSlug);

  // Filtramos por tenantId además del id: no confiar en el id de la URL solo.
  const location = await prisma.location.findFirst({
    where: { id: locationId, tenantId: tenant.id },
  });
  if (!location) notFound();

  const professionals = await prisma.professional.findMany({
    where: { tenantId: tenant.id, active: true },
    include: { professionalLocations: { where: { locationId: location.id } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/locations`} className="shell-link">
        ← Volver a sedes
      </Link>
      <h1 className="page-title mt-3">{location.name}</h1>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <form action={updateLocationAndProfessionalsAction.bind(null, tenantSlug, locationId)} className="mt-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required defaultValue={location.name} className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="address">
            Dirección
          </label>
          <input
            id="address"
            name="address"
            type="text"
            defaultValue={location.address ?? ""}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="timezone">
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            defaultValue={location.timezone}
            className="field-input"
          />
        </div>

        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Profesionales asignados a esta sede</p>
          {professionals.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Este negocio todavía no tiene profesionales activos.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {professionals.map((professional) => (
                <label key={professional.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="professionalIds"
                    value={professional.id}
                    defaultChecked={professional.professionalLocations.length > 0}
                    className="field-checkbox"
                  />
                  {professional.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary">
          Guardar
        </button>
      </form>
    </div>
  );
}
