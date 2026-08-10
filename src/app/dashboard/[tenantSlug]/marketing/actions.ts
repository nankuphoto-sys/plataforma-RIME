"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MarketingCampaignSegment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMarketingAccess } from "@/lib/auth-guards";
import { buildSegmentWhereClause } from "@/lib/marketing";

const VALID_SEGMENTS: readonly MarketingCampaignSegment[] = ["ALL_CLIENTS", "INACTIVE_60_DAYS"];

export async function createAndSendCampaignAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { session, tenant } = await requireMarketingAccess(tenantSlug);

  const subject = formData.get("subject")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const segment = formData.get("segment")?.toString() as MarketingCampaignSegment | undefined;

  if (!subject || !body) {
    redirect(
      `/dashboard/${tenantSlug}/marketing/new?error=${encodeURIComponent("Completá el asunto y el mensaje.")}`
    );
  }
  if (!segment || !VALID_SEGMENTS.includes(segment)) {
    redirect(`/dashboard/${tenantSlug}/marketing/new?error=${encodeURIComponent("Elegí un segmento.")}`);
  }

  const recipients = await prisma.client.findMany({
    where: buildSegmentWhereClause(segment, tenant.id, new Date()),
    select: { id: true, email: true },
  });

  if (recipients.length === 0) {
    redirect(
      `/dashboard/${tenantSlug}/marketing/new?error=${encodeURIComponent("No hay destinatarios en ese segmento.")}`
    );
  }

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.marketingCampaign.create({
      data: {
        tenantId: tenant.id,
        subject,
        body,
        segment,
        recipientCount: recipients.length,
        createdByUserId: session.user.id,
      },
    });

    await tx.notificationQueue.createMany({
      data: recipients.map((recipient) => ({
        tenantId: tenant.id,
        clientId: recipient.id,
        campaignId: created.id,
        channel: "EMAIL" as const,
        kind: "MARKETING_CAMPAIGN" as const,
        status: "SCHEDULED" as const,
        scheduledFor: new Date(),
        payload: {
          to: recipient.email,
          subject,
          body,
          unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/darse-de-baja?client=${recipient.id}&tenant=${tenantSlug}`,
        },
      })),
    });

    return created;
  });

  revalidatePath(`/dashboard/${tenantSlug}/marketing`);
  redirect(`/dashboard/${tenantSlug}/marketing/${campaign.id}`);
}
