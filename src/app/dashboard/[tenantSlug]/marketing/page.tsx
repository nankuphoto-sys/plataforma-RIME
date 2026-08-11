import Link from "next/link";
import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMarketingAccess } from "@/lib/auth-guards";
import { EmptyState } from "@/components/ui/EmptyState";

const SEGMENT_LABELS = {
  ALL_CLIENTS: "Todos los clientes",
  INACTIVE_60_DAYS: "Inactivos hace 60+ días",
} as const;

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireMarketingAccess(tenantSlug);

  const campaigns = await prisma.marketingCampaign.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });

  const sentCounts = await prisma.notificationQueue.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: true,
  });

  function countFor(campaignId: string, status: "SENT" | "FAILED"): number {
    return sentCounts.find((c) => c.campaignId === campaignId && c.status === status)?._count ?? 0;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Marketing</h1>
        <Link href={`/dashboard/${tenantSlug}/marketing/new`} className="btn-primary">
          <Megaphone className="h-4 w-4" />
          Nueva campaña
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} message="Todavía no mandaste ninguna campaña." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => {
            const failed = countFor(campaign.id, "FAILED");
            return (
              <Link
                key={campaign.id}
                href={`/dashboard/${tenantSlug}/marketing/${campaign.id}`}
                className="panel group flex flex-col gap-3 hover:-translate-y-0.5 hover:border-pine/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-pine/10 text-pine"
                    aria-hidden
                  >
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink group-hover:text-pine">{campaign.subject}</p>
                    <p className="truncate text-xs text-ink/50">{SEGMENT_LABELS[campaign.segment]}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-sage-dark/25 pt-3 text-xs">
                  <span className="data-mono text-ink/60">
                    {countFor(campaign.id, "SENT")} / {campaign.recipientCount} enviados
                    {failed > 0 && <span className="text-berry-dark"> · {failed} fallidos</span>}
                  </span>
                  <span className="data-mono text-ink/45">
                    {campaign.createdAt.toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
