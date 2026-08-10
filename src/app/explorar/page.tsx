import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StarRating } from "@/components/ui/StarRating";

const VERTICAL_OPTIONS = [
  { value: "GENERAL", label: "General" },
  { value: "PSICOLOGIA", label: "Psicología" },
  { value: "NUTRICION", label: "Nutrición" },
  { value: "FISIOTERAPIA", label: "Fisioterapia" },
  { value: "ESTETICA", label: "Estética" },
  { value: "BARBERIA", label: "Barbería" },
] as const;

const VERTICAL_LABELS: Record<string, string> = Object.fromEntries(
  VERTICAL_OPTIONS.map((option) => [option.value, option.label])
);

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; vertical?: string }>;
}) {
  const { q, vertical } = await searchParams;

  const tenants = await prisma.tenant.findMany({
    where: {
      marketplaceListed: true,
      status: { in: ["TRIAL", "ACTIVE"] },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(vertical ? { vertical: vertical as (typeof VERTICAL_OPTIONS)[number]["value"] } : {}),
    },
    include: { locations: { take: 1 } },
    orderBy: { name: "asc" },
  });

  const reviewStats = tenants.length
    ? await prisma.review.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenants.map((t) => t.id) }, visible: true, submittedAt: { not: null } },
        _avg: { rating: true },
        _count: true,
      })
    : [];

  function statsFor(tenantId: string) {
    const stats = reviewStats.find((s) => s.tenantId === tenantId);
    return { avg: stats?._avg.rating ?? 0, count: stats?._count ?? 0 };
  }

  const hasFilters = Boolean(q || vertical);

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Marketplace</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Explorá negocios en RIME
        </h1>
        <p className="mt-3 text-sm text-ink/55">
          Encontrá un negocio y reservá directo, sin salir de acá.
        </p>

        <form className="mt-6 flex flex-col gap-3 sm:flex-row" action="/explorar">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre…"
            className="field-input mt-0 flex-1"
          />
          <select name="vertical" defaultValue={vertical ?? ""} className="field-input mt-0 sm:w-56">
            <option value="">Todos los rubros</option>
            {VERTICAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary shrink-0">
            Buscar
          </button>
        </form>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {tenants.map((tenant) => {
            const { avg, count } = statsFor(tenant.id);
            const location = tenant.locations[0];
            return (
              <Link
                key={tenant.id}
                href={`/${tenant.slug}?from=marketplace`}
                className="panel block transition hover:border-pine/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">{tenant.name}</h2>
                  <span className="badge badge-sage shrink-0">{VERTICAL_LABELS[tenant.vertical] ?? tenant.vertical}</span>
                </div>
                {tenant.marketplaceDescription && (
                  <p className="mt-2 text-sm text-ink/60">{tenant.marketplaceDescription}</p>
                )}
                {location?.address && <p className="mt-2 text-xs text-ink/40">{location.address}</p>}
                {count > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <StarRating value={avg} size="sm" />
                    <span className="text-xs text-ink/50">
                      {avg.toFixed(1)} · {count} {count === 1 ? "reseña" : "reseñas"}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {tenants.length === 0 && hasFilters && (
          <p className="mt-10 text-center text-sm text-ink/40">
            No encontramos negocios que coincidan con esa búsqueda.
          </p>
        )}
        {tenants.length === 0 && !hasFilters && (
          <p className="mt-10 text-center text-sm text-ink/40">
            Todavía no hay negocios listados en el marketplace.
          </p>
        )}
      </div>
    </main>
  );
}
