import Link from "next/link";
import { UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTeamManageAccess } from "@/lib/auth-guards";

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
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Equipo</h1>
        <Link href={`/dashboard/${tenantSlug}/team/new`} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Invitar usuario
        </Link>
      </div>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Email</th>
              <th className="table-head-cell">Accesos</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const accessSummary = user.locationRoles.length
                ? user.locationRoles
                    .map((role) => `${role.location.name}: ${role.role}`)
                    .join(" · ")
                : "Sin acceso";
              return (
                <tr key={user.id} className="table-row">
                  <td className="table-cell">
                    <Link
                      href={`/dashboard/${tenantSlug}/team/${user.id}`}
                      className="font-medium text-ink hover:text-pine hover:underline"
                    >
                      {user.name}
                    </Link>
                  </td>
                  <td className="table-cell-muted">{user.email}</td>
                  <td className="table-cell-muted">{accessSummary}</td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-row">
                  Este negocio todavía no tiene usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
