import Link from "next/link";
import { Briefcase, MapPin, Percent, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProfessionalsManageAccess } from "@/lib/auth-guards";
import { getPlanLimits, hasReachedProfessionalLimit } from "@/lib/planLimits";
import { initials } from "@/lib/avatar";

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
    <div className="mx-auto max-w-6xl">
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

      {professionals.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Este negocio todavía no tiene profesionales.
        </div>
      ) : (
        // Tarjeta a todo color en vez de fila de tabla — mismo lenguaje que
        // "Hecho para tu especialidad" de la landing (SpecialtyGrid.tsx):
        // el color ES la tarjeta, con el nombre superpuesto sobre un scrim.
        // El activo se ve vívido en pine; el inactivo se apaga a un gris
        // desaturado (no un color de "alerta" — simplemente "no está
        // trabajando ahora mismo") para que el estado se lea de un vistazo
        // sin tener que leer el badge.
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {professionals.map((professional) => (
            <Link
              key={professional.id}
              href={`/dashboard/${tenantSlug}/professionals/${professional.id}`}
              className={`group relative block h-52 overflow-hidden rounded-2xl bg-gradient-to-br transition duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/10 ${
                professional.active ? "from-pine to-pine-dark" : "from-ink/50 to-ink/70"
              }`}
            >
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent"
              />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white/15 text-lg font-bold text-paper backdrop-blur-sm"
                    aria-hidden
                  >
                    {initials(professional.name)}
                  </span>
                  <span
                    className={`badge flex-none ${professional.active ? "bg-white/20 text-paper" : "bg-white/10 text-paper/70"}`}
                  >
                    {professional.active ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div>
                  <p className="text-lg font-semibold text-paper drop-shadow-sm">{professional.name}</p>
                  <div className="mt-2 flex items-center gap-3.5 text-xs text-paper/80">
                    <span className="flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5" aria-hidden />
                      {Number(professional.commissionRate)}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden />
                      {professional._count.services}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {professional._count.professionalLocations}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
