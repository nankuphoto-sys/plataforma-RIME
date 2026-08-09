import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { requireTeamManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createTeamMemberAction } from "../actions";

const ROLE_LABELS: Record<string, string> = {
  NONE: "Sin acceso",
  OWNER: "Propietario (OWNER)",
  ADMIN: "Administrador (ADMIN)",
  STAFF: "Staff",
  PROFESSIONAL: "Profesional",
};

export default async function NewTeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const { tenant, isOwner } = await requireTeamManageAccess(tenantSlug);

  const roleOptions = isOwner
    ? (["NONE", "OWNER", "ADMIN", "STAFF", "PROFESSIONAL"] as const)
    : (["NONE", "ADMIN", "STAFF", "PROFESSIONAL"] as const);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/team`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a equipo
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Invitar usuario</h1>
      <p className="page-subtitle">
        Se crea la cuenta con una contraseña temporal generada por el sistema. Deberás pasársela a la
        persona por fuera de la app (WhatsApp, en persona, etc.) — todavía no hay invitación por email.
      </p>

      <form action={createTeamMemberAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="name">
            Nombre
          </label>
          <input id="name" name="name" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required className="field-input" />
        </div>

        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Acceso por sede</p>
          {tenant.locations.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Este negocio todavía no tiene sedes.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {tenant.locations.map((location) => (
                <div key={location.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink/75">{location.name}</span>
                  <select name={`role_${location.id}`} defaultValue="NONE" className="field-input mt-0 w-auto">
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

        <SubmitButton icon={<UserPlus className="h-4 w-4" />} pendingLabel="Creando…">
          Crear usuario
        </SubmitButton>
      </form>
    </div>
  );
}
