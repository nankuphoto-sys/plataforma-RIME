import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q } = await searchParams;
  const { tenant } = await requireDashboardAccess(tenantSlug);

  const query = q?.trim();

  const clients = await prisma.client.findMany({
    where: {
      tenantId: tenant.id,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { appointments: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Clientes</h1>
        <Link href={`/dashboard/${tenantSlug}/clients/new`} className="btn-primary">
          + Nuevo cliente
        </Link>
      </div>

      <form method="get" className="mt-6">
        <input
          type="text"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Buscar por nombre o email..."
          className="field-input mt-0 sm:w-80"
        />
      </form>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Email</th>
              <th className="table-head-cell">Teléfono</th>
              <th className="table-head-cell">Citas</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/clients/${client.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {client.name}
                  </Link>
                </td>
                <td className="table-cell-muted">{client.email ?? "—"}</td>
                <td className="table-cell-muted data-mono">{client.phone ?? "—"}</td>
                <td className="table-cell-muted data-mono">{client._count.appointments}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  {query ? "No se encontraron clientes." : "Todavía no hay clientes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
