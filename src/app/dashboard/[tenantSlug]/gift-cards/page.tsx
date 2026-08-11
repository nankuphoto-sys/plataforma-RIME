import Link from "next/link";
import { Gift } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireGiftCardsAccess } from "@/lib/auth-guards";
import { EmptyState } from "@/components/ui/EmptyState";
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

      {giftCards.length === 0 ? (
        <EmptyState icon={Gift} message="Todavía no emitiste ninguna gift card." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {giftCards.map((card) => (
            <Link
              key={card.id}
              href={`/dashboard/${tenantSlug}/gift-cards/${card.id}`}
              className="panel group flex flex-col gap-4 hover:-translate-y-0.5 hover:border-pine/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-pine/10 text-pine"
                  aria-hidden
                >
                  <Gift className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="data-mono truncate font-medium text-ink group-hover:text-pine">{card.code}</p>
                  <p className="truncate text-xs text-ink/50">{card.recipientName ?? "Sin destinatario"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-sage-dark/25 pt-3 text-xs">
                <span className="data-mono text-ink/60">
                  {Number(card.balance).toLocaleString("es-CO")} / {Number(card.initialAmount).toLocaleString("es-CO")}
                </span>
                <span className={`badge ${STATUS_BADGE[card.status]}`}>{STATUS_LABELS[card.status]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
