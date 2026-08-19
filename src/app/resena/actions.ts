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
      `/resena?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Elige una calificación de 1 a 5 estrellas.")}`
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

  // updateMany con submittedAt: null en el where (no un update por id) como
  // guarda contra un doble submit concurrente (doble click, o "atrás" del
  // navegador reenviando el POST): sin esto, dos requests podrían pasar el
  // chequeo de arriba antes de que cualquiera escriba, y la segunda
  // pisaría la reseña ya guardada de la primera en vez de fallar.
  const updated = await prisma.review.updateMany({
    where: { id: review!.id, submittedAt: null },
    data: {
      rating,
      comment: comment ? comment.slice(0, MAX_COMMENT_LENGTH) : null,
      submittedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    redirect(`/resena?token=${encodeURIComponent(token)}&error=${encodeURIComponent("token-invalido")}`);
  }

  redirect(`/resena?token=${encodeURIComponent(token)}`);
}
