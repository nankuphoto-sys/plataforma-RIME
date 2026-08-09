import Link from "next/link";
import { UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProfessionalsManageAccess } from "@/lib/auth-guards";
import { getPlanLimits, hasReachedProfessionalLimit } from "@/lib/planLimits";

export default async function ProfessionalsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const professionals = await prisma.professional.findMany({
    where: { tenantId: tenant.id },
    include: { _count: { select: { professionalLocations: true, services: true } } },
    orderBy: { name: "asc" },
  });

  const activeCount = professionals.filter((professional) => professional.active).length;
  const { maxProfessionals } = getPlanLimits(tenant.plan);
  const atProfessionalLimit = hasReachedProfessionalLimit(tenant.plan, activeCount);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Profesionales</h1>
        <Link href={`/dashboard/${tenantSlug}/professionals/new`} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Nuevo profesional
        </Link>
      </div>

      <p className="page-subtitle">
        {maxProfessionals === null
          ? `${activeCount} profesional${activeCount === 1 ? "" : "es"} activo${activeCount === 1 ? "" : "s"} en tu plan ${tenant.plan} (sin límite).`
          : `${activeCount} de ${maxProfessionals} profesional${maxProfessionals === 1 ? "" : "es"} activo${maxProfessionals === 1 ? "" : "s"} en tu plan ${tenant.plan}.`}
        {atProfessionalLimit &&
          " Alcanzaste el máximo de tu plan — desactiva otro profesional o sube de plan para activar más."}
      </p>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Estado</th>
              <th className="table-head-cell">Comisión</th>
              <th className="table-head-cell">Sedes</th>
              <th className="table-head-cell">Servicios</th>
            </tr>
          </thead>
          <tbody>
            {professionals.map((professional) => (
              <tr key={professional.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/professionals/${professional.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {professional.name}
                  </Link>
                </td>
                <td className="table-cell">
                  {professional.active ? (
                    <span className="badge badge-pine">Activo</span>
                  ) : (
                    <span className="badge badge-sage">Inactivo</span>
                  )}
                </td>
                <td className="table-cell-muted data-mono">{Number(professional.commissionRate)}%</td>
                <td className="table-cell-muted data-mono">{professional._count.professionalLocations}</td>
                <td className="table-cell-muted data-mono">{professional._count.services}</td>
              </tr>
            ))}
            {professionals.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  Este negocio todavía no tiene profesionales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
