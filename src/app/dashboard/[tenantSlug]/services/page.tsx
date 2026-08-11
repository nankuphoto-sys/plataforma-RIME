import Link from "next/link";
import { Clock, ClipboardPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireServicesManageAccess } from "@/lib/auth-guards";

// Mismo lenguaje "tarjeta de portada" que Profesionales — el color es la
// tarjeta completa, no una franja. Tres variantes en vez de un solo tono
// fijo para que una lista larga de servicios no se vea monótona; siempre
// dentro del rango pine/ink (nunca gold/berry, reservados para estado).
const ACTIVE_TONES = ["from-pine to-pine-dark", "from-pine-dark to-ink", "from-ink to-pine-dark"] as const;

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
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Servicios</h1>
        <Link href={`/dashboard/${tenantSlug}/services/new`} className="btn-primary">
          <ClipboardPlus className="h-4 w-4" />
          Nuevo servicio
        </Link>
      </div>

      {services.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Este negocio todavía no tiene servicios.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <Link
              key={service.id}
              href={`/dashboard/${tenantSlug}/services/${service.id}`}
              className={`group relative block h-40 overflow-hidden rounded-2xl bg-gradient-to-br transition duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/10 ${
                service.active ? ACTIVE_TONES[index % ACTIVE_TONES.length] : "from-ink/50 to-ink/70"
              }`}
            >
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent"
              />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge bg-white/15 text-paper">
                    <Clock className="mr-1 h-3 w-3" aria-hidden />
                    {service.durationMinutes} min
                  </span>
                  {!service.active && <span className="badge bg-white/10 text-paper/70">Inactivo</span>}
                </div>

                <div>
                  <p className="text-lg font-semibold text-paper drop-shadow-sm">{service.name}</p>
                  <p className="data-mono mt-1 text-2xl font-bold text-paper">
                    ${Number(service.price).toLocaleString("es-CO")}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
