import Link from "next/link";
import { MapPinPlus } from "lucide-react";
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
    <div className="mx-auto max-w-3xl">
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

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Dirección</th>
              <th className="table-head-cell">Timezone</th>
              <th className="table-head-cell">Profesionales</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/locations/${location.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {location.name}
                  </Link>
                </td>
                <td className="table-cell-muted">{location.address ?? "—"}</td>
                <td className="table-cell-muted data-mono">{location.timezone}</td>
                <td className="table-cell-muted data-mono">{location._count.professionalLocations}</td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Este negocio todavía no tiene sedes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
