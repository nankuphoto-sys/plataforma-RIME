import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashReviewToken } from "@/lib/reviewToken";
import { StarRating } from "@/components/ui/StarRating";
import { ReviewForm } from "./ReviewForm";

function InvalidLinkShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <div className="auth-brand">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-ink">RIME</span>
        </div>
        <div className="auth-card">{children}</div>
      </div>
    </main>
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <InvalidLinkShell>
        <h1 className="page-title text-2xl">Link inválido</h1>
        <p className="page-subtitle">Este link para dejar una reseña no es válido.</p>
      </InvalidLinkShell>
    );
  }

  const review = await prisma.review.findUnique({
    where: { tokenHash: hashReviewToken(token) },
    include: { tenant: true, appointment: { include: { service: true, professional: true } } },
  });

  const isInvalid = !review || (review.submittedAt === null && review.expiresAt < new Date());

  if (isInvalid) {
    return (
      <InvalidLinkShell>
        <h1 className="page-title text-2xl">Link inválido</h1>
        <p className="page-subtitle">
          Este link ya no es válido — puede haber expirado o corresponder a otra cita.
        </p>
      </InvalidLinkShell>
    );
  }

  if (review.submittedAt !== null) {
    return (
      <InvalidLinkShell>
        <h1 className="page-title text-2xl">¡Gracias por tu reseña!</h1>
        <p className="page-subtitle">Ya quedó registrada para {review.tenant.name}.</p>
        <div className="mt-4">
          <StarRating value={review.rating ?? 0} />
        </div>
        {review.comment && <p className="mt-3 text-sm text-ink/70">&ldquo;{review.comment}&rdquo;</p>}
      </InvalidLinkShell>
    );
  }

  const errorMessage =
    error === "token-invalido"
      ? "Este link ya no es válido — puede haber expirado o ya haberse usado."
      : error;

  return (
    <InvalidLinkShell>
      <h1 className="page-title text-2xl">¿Cómo te fue?</h1>
      <p className="page-subtitle">
        {review.appointment.service.name} con {review.appointment.professional.name} en{" "}
        {review.tenant.name}.
      </p>

      {errorMessage && <p className="msg-error mt-3">{errorMessage}</p>}

      <ReviewForm token={token} />

      <p className="mt-5 text-center text-sm text-ink/50">
        <Link href="/" className="text-pine underline-offset-2 hover:underline">
          Volver al inicio
        </Link>
      </p>
    </InvalidLinkShell>
  );
}
