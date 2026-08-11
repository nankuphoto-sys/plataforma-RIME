import Link from "next/link";
import { UserPlus } from "lucide-react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeamManageAccess } from "@/lib/auth-guards";
import { avatarTone, initials } from "@/lib/avatar";

// OWNER se destaca en gold (el único rol que ve todo, sin restricción de
// sede) — el resto de los roles comparten pine, la jerarquía real que
// importa mostrar de un vistazo es "quién es dueño" vs. "todo lo demás".
const ROLE_BADGE: Record<Role, string> = {
  OWNER: "badge-gold",
  ADMIN: "badge-pine",
  STAFF: "badge-pine",
  PROFESSIONAL: "badge-pine",
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTeamManageAccess(tenantSlug);

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    include: { locationRoles: { include: { location: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Equipo</h1>
        <Link href={`/dashboard/${tenantSlug}/team/new`} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Invitar usuario
        </Link>
      </div>

      {users.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Este negocio todavía no tiene usuarios.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/dashboard/${tenantSlug}/team/${user.id}`}
              className="panel group flex flex-col gap-4 hover:-translate-y-0.5 hover:border-pine/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-semibold text-paper ${avatarTone(user.id)}`}
                  aria-hidden
                >
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink group-hover:text-pine">{user.name}</p>
                  <p className="truncate text-xs text-ink/50">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-sage-dark/25 pt-3">
                {user.locationRoles.length === 0 ? (
                  <span className="badge badge-sage">Sin acceso</span>
                ) : (
                  user.locationRoles.map((role) => (
                    <span key={role.locationId} className={`badge ${ROLE_BADGE[role.role]}`}>
                      {role.location.name} · {role.role}
                    </span>
                  ))
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
