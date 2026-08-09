import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2, Save, Unlink, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProfessionalsManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  inviteProfessionalAsUserAction,
  linkExistingUserToProfessionalAction,
  unlinkProfessionalUserAction,
  updateProfessionalAction,
} from "../actions";

export default async function ProfessionalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; professionalId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; invited?: string; linked?: string; unlinked?: string }>;
}) {
  const { tenantSlug, professionalId } = await params;
  const { error, saved, invited, linked, unlinked } = await searchParams;
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  // Filtramos por tenantId además del id: no confiar en el id de la URL solo.
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
    include: { professionalLocations: true },
  });
  if (!professional) notFound();

  const [services, locations, linkedUser, availableUsers] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId: tenant.id, active: true },
      include: { professionals: { where: { professionalId: professional.id } } },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { tenantId: tenant.id },
      include: { professionalLocations: { where: { professionalId: professional.id } } },
      orderBy: { name: "asc" },
    }),
    professional.userId ? prisma.user.findUnique({ where: { id: professional.userId } }) : null,
    professional.userId
      ? []
      : prisma.user.findMany({
          where: { tenantId: tenant.id, professionalProfile: null },
          orderBy: { name: "asc" },
        }),
  ]);

  const hasAssignedLocations = professional.professionalLocations.length > 0;

  let temporaryPassword: string | null = null;
  if (invited === "1") {
    const cookieStore = await cookies();
    temporaryPassword = cookieStore.get("newUserTempPassword")?.value ?? null;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/professionals`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a profesionales
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{professional.name}</h1>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <form
        action={updateProfessionalAction.bind(null, tenantSlug, professionalId)}
        className="mt-6 space-y-4"
      >
        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={professional.name}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="bio">
            Bio
          </label>
          <textarea id="bio" name="bio" rows={3} defaultValue={professional.bio ?? ""} className="field-input" />
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
            defaultValue={Number(professional.commissionRate)}
            className="field-input"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={professional.active}
            className="field-checkbox"
          />
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
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={service.id}
                    defaultChecked={service.professionals.length > 0}
                    className="field-checkbox"
                  />
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
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.id}
                    defaultChecked={location.professionalLocations.length > 0}
                    className="field-checkbox"
                  />
                  {location.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </form>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Acceso al dashboard</p>

        {linked === "1" && <p className="msg-success mt-2">Usuario vinculado.</p>}
        {unlinked === "1" && <p className="msg-success mt-2">Vínculo eliminado.</p>}

        {temporaryPassword && (
          <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            Guarda esta contraseña ahora, no se va a volver a mostrar:{" "}
            <span className="data-mono font-semibold">{temporaryPassword}</span>
          </div>
        )}

        {linkedUser ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-ink/75">
              Vinculado a <span className="font-medium">{linkedUser.name}</span> ({linkedUser.email})
            </p>
            <form action={unlinkProfessionalUserAction.bind(null, tenantSlug, professionalId)}>
              <SubmitButton
                icon={<Unlink className="h-4 w-4" />}
                pendingLabel="Quitando…"
                className="btn-secondary"
              >
                Quitar vínculo
              </SubmitButton>
            </form>
          </div>
        ) : !hasAssignedLocations ? (
          <p className="mt-2 text-sm text-ink/60">
            Asigná al menos una sede a este profesional antes de darle acceso al dashboard.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            <form
              action={inviteProfessionalAsUserAction.bind(null, tenantSlug, professionalId)}
              className="space-y-3"
            >
              <p className="text-sm font-medium text-ink/75">Invitar como usuario nuevo</p>
              <div>
                <label className="field-label" htmlFor="inviteName">
                  Nombre
                </label>
                <input
                  id="inviteName"
                  name="name"
                  type="text"
                  required
                  defaultValue={professional.name}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="inviteEmail">
                  Email
                </label>
                <input id="inviteEmail" name="email" type="email" required className="field-input" />
              </div>
              <SubmitButton icon={<UserPlus className="h-4 w-4" />} pendingLabel="Invitando…">
                Invitar
              </SubmitButton>
            </form>

            <form
              action={linkExistingUserToProfessionalAction.bind(null, tenantSlug, professionalId)}
              className="space-y-3 border-t border-sage-dark/30 pt-4"
            >
              <p className="text-sm font-medium text-ink/75">Vincular a un usuario existente del equipo</p>
              {availableUsers.length === 0 ? (
                <p className="text-sm text-ink/40">
                  No hay usuarios del equipo disponibles para vincular (todos ya están vinculados a otro
                  profesional, o no hay ninguno todavía).
                </p>
              ) : (
                <>
                  <select name="userId" required className="field-input" defaultValue="">
                    <option value="" disabled>
                      Elegí un usuario
                    </option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                  <SubmitButton icon={<Link2 className="h-4 w-4" />} pendingLabel="Vinculando…">
                    Vincular
                  </SubmitButton>
                </>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
