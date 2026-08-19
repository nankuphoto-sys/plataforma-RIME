import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTeamManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { resetTeamMemberPasswordAction, updateTeamMemberAction } from "../actions";

const ROLE_LABELS: Record<string, string> = {
  NONE: "Sin acceso",
  OWNER: "Propietario (OWNER)",
  ADMIN: "Administrador (ADMIN)",
  STAFF: "Staff",
  PROFESSIONAL: "Profesional",
};

export default async function TeamMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; userId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; created?: string; resetPw?: string }>;
}) {
  const { tenantSlug, userId } = await params;
  const { error, saved, created, resetPw } = await searchParams;
  const { tenant, isOwner } = await requireTeamManageAccess(tenantSlug);

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id },
    include: { locationRoles: true },
  });
  if (!user) notFound();

  const roleByLocationId = new Map(user.locationRoles.map((role) => [role.locationId, role.role]));

  const roleOptions = isOwner
    ? (["NONE", "OWNER", "ADMIN", "STAFF", "PROFESSIONAL"] as const)
    : (["NONE", "ADMIN", "STAFF", "PROFESSIONAL"] as const);

  let temporaryPassword: string | null = null;
  if (created === "1" || resetPw === "1") {
    const cookieStore = await cookies();
    temporaryPassword = cookieStore.get(`newUserTempPassword_${userId}`)?.value ?? null;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/team`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a equipo
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{user.name}</h1>
      <p className="page-subtitle">{user.email}</p>

      {temporaryPassword && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
          Guarda esta contraseña ahora, no se va a volver a mostrar:{" "}
          <span className="data-mono font-semibold">{temporaryPassword}</span>
        </div>
      )}

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <form action={updateTeamMemberAction.bind(null, tenantSlug, userId)} className="mt-6 space-y-4">
        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Acceso por sede</p>
          {tenant.locations.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Este negocio todavía no tiene sedes.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {tenant.locations.map((location) => (
                <div key={location.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink/75">{location.name}</span>
                  <select
                    name={`role_${location.id}`}
                    defaultValue={roleByLocationId.get(location.id) ?? "NONE"}
                    className="field-input mt-0 w-auto"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </form>

      <form
        action={resetTeamMemberPasswordAction.bind(null, tenantSlug, userId)}
        className="mt-6 border-t border-sage-dark/30 pt-4"
      >
        <p className="section-title text-sm">Reseteo asistido</p>
        <p className="mt-2 text-sm text-ink/60">
          Genera una nueva contraseña temporal para este usuario, por si no puede usar el link de
          recuperación por email.
        </p>
        <SubmitButton
          icon={<KeyRound className="h-4 w-4" />}
          pendingLabel="Restableciendo…"
          className="btn-primary mt-3"
        >
          Restablecer contraseña
        </SubmitButton>
      </form>
    </div>
  );
}
