import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q, error } = await searchParams;
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Un usuario que en TODO el tenant solo tiene rol PROFESSIONAL (nunca
  // OWNER/ADMIN/STAFF en ninguna sede) ve solo los clientes con los que
  // tiene al menos una cita — nunca el CRM completo del negocio. Client no
  // tiene locationId propio, así que esto se decide a nivel de tenant, no
  // de sede puntual (a diferencia de la agenda).
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  const viewerProfessionalId = isProfessionalOnly
    ? await getLinkedProfessionalId(session.user.id)
    : null;

  if (isProfessionalOnly && !viewerProfessionalId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="page-title">Clientes</h1>
        <p className="mt-6 text-sm text-ink/40">
          Tu usuario todavía no tiene un profesional vinculado en este negocio. Pedile a tu
          administrador que lo revise desde Profesionales.
        </p>
      </div>
    );
  }

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
      // "Solo lo mío": clientes con al menos una cita con este profesional.
      // No se toca para OWNER/ADMIN/STAFF (siguen viendo el CRM completo).
      ...(isProfessionalOnly ? { appointments: { some: { professionalId: viewerProfessionalId! } } } : {}),
    },
    include: {
      // El conteo también se filtra a "solo lo mío" — si no, un profesional
      // vería el total de citas del cliente con TODOS los profesionales del
      // negocio, filtrando indirectamente cuánto lo atendieron otros colegas.
      _count: {
        select: {
          appointments: isProfessionalOnly ? { where: { professionalId: viewerProfessionalId! } } : true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Clientes</h1>
        {/* Crear clientes nuevos queda para recepción/administración — un
            profesional "solo lo mío" ve únicamente clientes con los que ya
            tiene una cita, así que un cliente recién creado por él quedaría
            invisible hasta tener una cita, un callejón sin salida confuso. */}
        {!isProfessionalOnly && (
          <Link href={`/dashboard/${tenantSlug}/clients/new`} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        )}
      </div>

      {error && <p className="msg-error mt-4">{error}</p>}

      <form method="get" className="relative mt-6 sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="text"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Buscar por nombre o email..."
          className="field-input mt-0 pl-9"
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
