import Link from "next/link";
import { CalendarCheck, Phone, Search, Star, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { avatarTone, initials } from "@/lib/avatar";
import { EmptyState } from "@/components/ui/EmptyState";

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
          Tu usuario todavía no tiene un profesional vinculado en este negocio. Pídele a tu
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
    <div className="mx-auto max-w-6xl">
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

      {clients.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          message={query ? "No se encontraron clientes." : "Todavía no hay clientes."}
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/dashboard/${tenantSlug}/clients/${client.id}`}
              className="panel group flex flex-col gap-4 hover:-translate-y-0.5 hover:border-pine/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-semibold text-paper ${avatarTone(client.id)}`}
                  aria-hidden
                >
                  {initials(client.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink group-hover:text-pine">{client.name}</p>
                  <p className="truncate text-xs text-ink/50">{client.email ?? "Sin email"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-sage-dark/25 pt-3 text-xs">
                <span className="data-mono flex items-center gap-1.5 text-ink/60">
                  <Phone className="h-3.5 w-3.5 flex-none text-ink/35" aria-hidden />
                  {client.phone ?? "—"}
                </span>
                <div className="flex items-center gap-1.5">
                  {tenant.loyaltyEnabled && client.loyaltyStamps > 0 && (
                    <span className="badge badge-gold">
                      <Star className="mr-1 h-3 w-3 fill-current" aria-hidden />
                      {client.loyaltyStamps}
                    </span>
                  )}
                  <span className="badge badge-pine">
                    <CalendarCheck className="mr-1 h-3 w-3" aria-hidden />
                    {client._count.appointments}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
