import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMarketingAccess } from "@/lib/auth-guards";
import { buildSegmentWhereClause } from "@/lib/marketing";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createAndSendCampaignAction } from "../actions";

export default async function NewCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const { tenant } = await requireMarketingAccess(tenantSlug);

  const now = new Date();
  const [allClientsCount, inactiveCount] = await Promise.all([
    prisma.client.count({ where: buildSegmentWhereClause("ALL_CLIENTS", tenant.id, now) }),
    prisma.client.count({ where: buildSegmentWhereClause("INACTIVE_60_DAYS", tenant.id, now) }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/marketing`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a marketing
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">Nueva campaña</h1>
      <p className="page-subtitle">
        Se manda por email ahora mismo. Cada envío incluye un link de baja que se respeta para
        siempre.
      </p>

      <form action={createAndSendCampaignAction.bind(null, tenantSlug)} className="mt-6 space-y-4">
        {error && <p className="msg-error">{error}</p>}

        <div>
          <p className="field-label">A quién</p>
          <div className="mt-1 space-y-2">
            <label className="flex items-center gap-2 rounded-lg border border-sage-dark/40 px-3 py-2 text-sm">
              <input type="radio" name="segment" value="ALL_CLIENTS" defaultChecked className="field-checkbox" />
              Todos los clientes con email
              <span className="ml-auto data-mono text-ink/40">{allClientsCount}</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-sage-dark/40 px-3 py-2 text-sm">
              <input type="radio" name="segment" value="INACTIVE_60_DAYS" className="field-checkbox" />
              Inactivos hace 60+ días
              <span className="ml-auto data-mono text-ink/40">{inactiveCount}</span>
            </label>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="subject">
            Asunto
          </label>
          <input id="subject" name="subject" type="text" required className="field-input" />
        </div>

        <div>
          <label className="field-label" htmlFor="body">
            Mensaje
          </label>
          <textarea id="body" name="body" rows={6} required className="field-input" />
        </div>

        <SubmitButton icon={<Megaphone className="h-4 w-4" />} pendingLabel="Enviando…">
          Enviar campaña
        </SubmitButton>
      </form>
    </div>
  );
}
