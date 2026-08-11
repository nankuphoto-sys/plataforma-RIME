import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireReviewsAccess } from "@/lib/auth-guards";
import { StarRating } from "@/components/ui/StarRating";
import { avatarTone, initials } from "@/lib/avatar";

export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireReviewsAccess(tenantSlug);

  // Solo reseñas ya respondidas — las invitaciones pendientes no son
  // accionables desde esta pantalla.
  const reviews = await prisma.review.findMany({
    where: { tenantId: tenant.id, submittedAt: { not: null } },
    include: { client: true },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="page-title">Reseñas</h1>
      <p className="page-subtitle">Solo de clientes que realmente tuvieron la cita.</p>

      {reviews.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Todavía no hay reseñas respondidas.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {reviews.map((review) => (
            <Link
              key={review.id}
              href={`/dashboard/${tenantSlug}/reviews/${review.id}`}
              className="panel group flex flex-col gap-3 hover:-translate-y-0.5 hover:border-pine/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-semibold text-paper ${avatarTone(review.client.id)}`}
                  aria-hidden
                >
                  {initials(review.client.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink group-hover:text-pine">{review.client.name}</p>
                  <StarRating value={review.rating ?? 0} size="sm" />
                </div>
                {review.visible ? (
                  <span className="badge badge-pine">Visible</span>
                ) : (
                  <span className="badge badge-sage">Oculta</span>
                )}
              </div>

              <p className="line-clamp-2 text-sm text-ink/65">{review.comment ?? "Sin comentario."}</p>

              <p className="data-mono border-t border-sage-dark/25 pt-3 text-xs text-ink/45">
                {review.submittedAt?.toLocaleDateString("es-CL", { dateStyle: "medium" })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
