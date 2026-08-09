import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProfessionalsManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createProfessionalAction } from "../actions";

export default async function NewProfessionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const [services, locations] = await Promise.all([
    prisma.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/professionals`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a profesionales
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Nuevo profesional</h1>

      <form action={createProfessionalAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="bio">
            Bio
          </label>
          <textarea id="bio" name="bio" rows={3} className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="commissionRate">
            % Comisión
          </label>
          <input
            id="commissionRate"
            name="commissionRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={0}
            className="field-input"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked className="field-checkbox" />
          Activo
        </label>

        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Servicios</p>
          {services.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Este negocio todavía no tiene servicios publicados.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {services.map((service) => (
                <label key={service.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="serviceIds" value={service.id} className="field-checkbox" />
                  {service.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Sedes</p>
          {locations.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Este negocio todavía no tiene sedes.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="locationIds" value={location.id} className="field-checkbox" />
                  {location.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <SubmitButton icon={<UserPlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear profesional
        </SubmitButton>
      </form>
    </div>
  );
}
