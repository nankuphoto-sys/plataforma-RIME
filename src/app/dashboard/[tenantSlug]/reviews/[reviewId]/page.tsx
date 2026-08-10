import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireReviewsAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { StarRating } from "@/components/ui/StarRating";
import { toggleReviewVisibilityAction } from "../actions";

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; reviewId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, reviewId } = await params;
  const { error, saved } = await searchParams;
  const { tenant } = await requireReviewsAccess(tenantSlug);

  const review = await prisma.review.findFirst({
    where: { id: reviewId, tenantId: tenant.id, submittedAt: { not: null } },
    include: { client: true, appointment: { include: { service: true, professional: true } } },
  });
  if (!review) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/reviews`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a reseñas
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{review.client.name}</h1>
      <p className="page-subtitle">
        {review.appointment.service.name} con {review.appointment.professional.name} ·{" "}
        {review.submittedAt?.toLocaleDateString("es-CL", { dateStyle: "medium" })}
      </p>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <div className="panel mt-6">
        <StarRating value={review.rating ?? 0} />
        {review.comment ? (
          <p className="mt-3 text-sm text-ink/80">&ldquo;{review.comment}&rdquo;</p>
        ) : (
          <p className="mt-3 text-sm text-ink/40">Sin comentario.</p>
        )}
      </div>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Visibilidad</p>
        <p className="mt-1 text-sm text-ink/60">
          {review.visible
            ? "Esta reseña se muestra en tu página pública de reserva."
            : "Esta reseña está oculta — no aparece en tu página pública."}
        </p>
        <form action={toggleReviewVisibilityAction.bind(null, tenantSlug, reviewId)} className="mt-3">
          <SubmitButton
            icon={review.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            pendingLabel="Guardando…"
            className="btn-secondary"
          >
            {review.visible ? "Ocultar reseña" : "Mostrar reseña"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
