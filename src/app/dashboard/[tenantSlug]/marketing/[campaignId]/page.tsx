import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMarketingAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";

const SEGMENT_LABELS = {
  ALL_CLIENTS: "Todos los clientes",
  INACTIVE_60_DAYS: "Inactivos hace 60+ días",
} as const;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; campaignId: string }>;
}) {
  const { tenantSlug, campaignId } = await params;
  const { tenant } = await requireMarketingAccess(tenantSlug);

  const campaign = await prisma.marketingCampaign.findFirst({
    where: { id: campaignId, tenantId: tenant.id },
  });
  if (!campaign) notFound();

  const [sent, failed, pending] = await Promise.all([
    prisma.notificationQueue.count({ where: { campaignId: campaign.id, status: "SENT" } }),
    prisma.notificationQueue.count({ where: { campaignId: campaign.id, status: "FAILED" } }),
    prisma.notificationQueue.count({ where: { campaignId: campaign.id, status: "SCHEDULED" } }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/marketing`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a marketing
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{campaign.subject}</h1>
      <p className="page-subtitle">
        {SEGMENT_LABELS[campaign.segment]} · {campaign.createdAt.toLocaleDateString("es-CO", { dateStyle: "medium" })}
      </p>

      <div className="panel mt-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="data-mono text-2xl font-semibold text-ink">{campaign.recipientCount}</p>
            <p className="text-xs text-ink/50">Destinatarios</p>
          </div>
          <div>
            <p className="data-mono text-2xl font-semibold text-pine">{sent}</p>
            <p className="text-xs text-ink/50">Enviados</p>
          </div>
          <div>
            <p className="data-mono text-2xl font-semibold text-berry-dark">{failed}</p>
            <p className="text-xs text-ink/50">Fallidos</p>
          </div>
        </div>
        {pending > 0 && (
          <p className="mt-4 text-center text-xs text-ink/50">
            {pending} todavía en cola — el envío corre una vez por día.
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Mensaje</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{campaign.body}</p>
      </div>
    </div>
  );
}
