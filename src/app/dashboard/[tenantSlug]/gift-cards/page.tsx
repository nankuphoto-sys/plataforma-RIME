import Link from "next/link";
import { Gift } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireGiftCardsAccess } from "@/lib/auth-guards";
import type { GiftCardStatus } from "@prisma/client";

const STATUS_LABELS: Record<GiftCardStatus, string> = {
  ACTIVE: "Activa",
  DEPLETED: "Sin saldo",
  CANCELLED: "Anulada",
};

const STATUS_BADGE: Record<GiftCardStatus, string> = {
  ACTIVE: "badge-pine",
  DEPLETED: "badge-sage",
  CANCELLED: "badge-neutral",
};

export default async function GiftCardsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireGiftCardsAccess(tenantSlug);

  const giftCards = await prisma.giftCard.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Gift cards</h1>
        <Link href={`/dashboard/${tenantSlug}/gift-cards/new`} className="btn-primary">
          <Gift className="h-4 w-4" />
          Emitir gift card
        </Link>
      </div>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Código</th>
              <th className="table-head-cell">Destinatario</th>
              <th className="table-head-cell">Saldo</th>
              <th className="table-head-cell">Estado</th>
            </tr>
          </thead>
          <tbody>
            {giftCards.map((card) => (
              <tr key={card.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/gift-cards/${card.id}`}
                    className="data-mono font-medium text-ink hover:text-pine hover:underline"
                  >
                    {card.code}
                  </Link>
                </td>
                <td className="table-cell-muted">{card.recipientName ?? "—"}</td>
                <td className="table-cell-muted data-mono">
                  {Number(card.balance).toLocaleString("es-CO")} / {Number(card.initialAmount).toLocaleString("es-CO")}
                </td>
                <td className="table-cell">
                  <span className={`badge ${STATUS_BADGE[card.status]}`}>{STATUS_LABELS[card.status]}</span>
                </td>
              </tr>
            ))}
            {giftCards.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Todavía no emitiste ninguna gift card.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
