import Link from "next/link";
import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMarketingAccess } from "@/lib/auth-guards";

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

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Asunto</th>
              <th className="table-head-cell">Segmento</th>
              <th className="table-head-cell">Destinatarios</th>
              <th className="table-head-cell">Enviados</th>
              <th className="table-head-cell">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/marketing/${campaign.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {campaign.subject}
                  </Link>
                </td>
                <td className="table-cell-muted">{SEGMENT_LABELS[campaign.segment]}</td>
                <td className="table-cell-muted data-mono">{campaign.recipientCount}</td>
                <td className="table-cell-muted data-mono">
                  {countFor(campaign.id, "SENT")}
                  {countFor(campaign.id, "FAILED") > 0 && (
                    <span className="text-berry-dark"> · {countFor(campaign.id, "FAILED")} fallidos</span>
                  )}
                </td>
                <td className="table-cell-muted data-mono">
                  {campaign.createdAt.toLocaleDateString("es-CO", { dateStyle: "medium" })}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  Todavía no mandaste ninguna campaña.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
