import Link from "next/link";
import { ArrowLeft, Gift } from "lucide-react";
import { requireGiftCardsManageAccess } from "@/lib/auth-guards";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createGiftCardAction } from "../actions";

export default async function NewGiftCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  await requireGiftCardsManageAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/gift-cards`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a gift cards
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Emitir gift card</h1>
      <p className="page-subtitle">
        El código se genera automáticamente. El cobro (efectivo, transferencia, en persona) lo manejas
        tú fuera de la app.
      </p>

      <form action={createGiftCardAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <label className="field-label" htmlFor="initialAmount">
            Monto
          </label>
          <input
            id="initialAmount"
            name="initialAmount"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="recipientName">
            Destinatario (opcional)
          </label>
          <input id="recipientName" name="recipientName" type="text" className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="purchaserName">
            Compró (opcional)
          </label>
          <input id="purchaserName" name="purchaserName" type="text" className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="purchaserContact">
            Contacto del comprador (opcional)
          </label>
          <input id="purchaserContact" name="purchaserContact" type="text" className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="expiresAt">
            Vence (opcional)
          </label>
          <input id="expiresAt" name="expiresAt" type="date" className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="note">
            Nota (opcional)
          </label>
          <textarea id="note" name="note" rows={2} className="field-input" />
        </div>

        <SubmitButton icon={<Gift className="h-4 w-4" />} pendingLabel="Emitiendo…">
          Emitir gift card
        </SubmitButton>
      </form>
    </div>
  );
}
