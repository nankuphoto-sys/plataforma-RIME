"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashReviewToken } from "@/lib/reviewToken";

const MAX_COMMENT_LENGTH = 1000;

export async function submitReviewAction(token: string, formData: FormData): Promise<void> {
  const rating = Number(formData.get("rating"));
  const comment = formData.get("comment")?.toString().trim() ?? "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect(
      `/resena?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Elegí una calificación de 1 a 5 estrellas.")}`
    );
  }

  const tokenHash = hashReviewToken(token);
  const review = await prisma.review.findUnique({ where: { tokenHash } });

  const isInvalid = !review || review.submittedAt !== null || review.expiresAt < new Date();

  // Mismo criterio que reset-password: un solo mensaje genérico sin importar
  // el motivo exacto (no existe, ya se respondió, o venció).
  if (isInvalid) {
    redirect(`/resena?token=${encodeURIComponent(token)}&error=${encodeURIComponent("token-invalido")}`);
  }

  await prisma.review.update({
    where: { id: review!.id },
    data: {
      rating,
      comment: comment ? comment.slice(0, MAX_COMMENT_LENGTH) : null,
      submittedAt: new Date(),
    },
  });

  redirect(`/resena?token=${encodeURIComponent(token)}`);
}
