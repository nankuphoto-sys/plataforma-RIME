import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireServicesManageAccess } from "@/lib/auth-guards";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireServicesManageAccess(tenantSlug);

  const services = await prisma.service.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Servicios</h1>
        <Link href={`/dashboard/${tenantSlug}/services/new`} className="btn-primary">
          + Nuevo servicio
        </Link>
      </div>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Estado</th>
              <th className="table-head-cell">Duración</th>
              <th className="table-head-cell">Precio</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/services/${service.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {service.name}
                  </Link>
                </td>
                <td className="table-cell">
                  {service.active ? (
                    <span className="badge badge-pine">Activo</span>
                  ) : (
                    <span className="badge badge-sage">Inactivo</span>
                  )}
                </td>
                <td className="table-cell-muted data-mono">{service.durationMinutes} min</td>
                <td className="table-cell-muted data-mono">{Number(service.price)}</td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Este negocio todavía no tiene servicios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
