import Link from "next/link";
import { Briefcase, Clock, MapPin, MapPinPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { getPlanLimits, hasReachedLocationLimit } from "@/lib/planLimits";

export default async function LocationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const locations = await prisma.location.findMany({
    where: { tenantId: tenant.id },
    include: { _count: { select: { professionalLocations: true } } },
    orderBy: { createdAt: "asc" },
  });

  const { maxLocations } = getPlanLimits(tenant.plan);
  const atLocationLimit = hasReachedLocationLimit(tenant.plan, locations.length);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Sedes</h1>
        {!atLocationLimit && (
          <Link href={`/dashboard/${tenantSlug}/locations/new`} className="btn-primary">
            <MapPinPlus className="h-4 w-4" />
            Nueva sede
          </Link>
        )}
      </div>

      <p className="page-subtitle">
        {maxLocations === null
          ? `${locations.length} sede${locations.length === 1 ? "" : "s"} usada${locations.length === 1 ? "" : "s"} en tu plan ${tenant.plan} (sin límite).`
          : `${locations.length} de ${maxLocations} sede${maxLocations === 1 ? "" : "s"} usadas en tu plan ${tenant.plan}.`}
        {atLocationLimit && " Alcanzaste el máximo de tu plan — sube de plan para agregar más sedes."}
      </p>

      {locations.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Este negocio todavía no tiene sedes.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Link
              key={location.id}
              href={`/dashboard/${tenantSlug}/locations/${location.id}`}
              className="panel group flex flex-col gap-4 hover:-translate-y-0.5 hover:border-pine/30"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
                  aria-hidden
                >
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink group-hover:text-pine">{location.name}</p>
                  <p className="truncate text-xs text-ink/50">{location.address ?? "Sin dirección cargada"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-sage-dark/25 pt-3 text-xs">
                <span className="flex items-center gap-1.5 text-ink/50">
                  <Clock className="h-3.5 w-3.5 flex-none" aria-hidden />
                  {location.timezone}
                </span>
                <span className="badge badge-pine">
                  <Briefcase className="mr-1 h-3 w-3" aria-hidden />
                  {location._count.professionalLocations}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
