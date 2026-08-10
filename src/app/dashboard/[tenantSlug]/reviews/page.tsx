import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireReviewsAccess } from "@/lib/auth-guards";
import { StarRating } from "@/components/ui/StarRating";

function excerpt(text: string | null, max = 80): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Cliente</th>
              <th className="table-head-cell">Calificación</th>
              <th className="table-head-cell">Comentario</th>
              <th className="table-head-cell">Fecha</th>
              <th className="table-head-cell">Estado</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/reviews/${review.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {review.client.name}
                  </Link>
                </td>
                <td className="table-cell">
                  <StarRating value={review.rating ?? 0} size="sm" />
                </td>
                <td className="table-cell-muted">{excerpt(review.comment)}</td>
                <td className="table-cell-muted data-mono">
                  {review.submittedAt?.toLocaleDateString("es-CL", { dateStyle: "medium" })}
                </td>
                <td className="table-cell">
                  {review.visible ? (
                    <span className="badge badge-pine">Visible</span>
                  ) : (
                    <span className="badge badge-sage">Oculta</span>
                  )}
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  Todavía no hay reseñas respondidas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
