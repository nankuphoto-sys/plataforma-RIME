"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireReviewsAccess } from "@/lib/auth-guards";

export async function toggleReviewVisibilityAction(tenantSlug: string, reviewId: string): Promise<void> {
  const { tenant } = await requireReviewsAccess(tenantSlug);

  const review = await prisma.review.findFirst({ where: { id: reviewId, tenantId: tenant.id } });
  if (!review) {
    redirect(`/dashboard/${tenantSlug}/reviews?error=${encodeURIComponent("Reseña no encontrada.")}`);
  }

  await prisma.review.update({
    where: { id: review!.id },
    data: { visible: !review!.visible },
  });

  redirect(`/dashboard/${tenantSlug}/reviews/${reviewId}?saved=1`);
}
