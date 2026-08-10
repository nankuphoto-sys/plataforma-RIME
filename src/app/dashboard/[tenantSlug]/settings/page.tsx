import { ShieldCheck } from "lucide-react";
import { requireSettingsAccess } from "@/lib/auth-guards";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { updateDepositPolicyAction } from "./actions";
import { DepositPolicyFields } from "./DepositPolicyFields";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error, saved } = await searchParams;
  const { tenant } = await requireSettingsAccess(tenantSlug);

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${tenant.slug}`;
  const embedSnippet = `<iframe src="${shareUrl}" width="100%" height="720" style="border:0;" title="Reservar cita — ${tenant.name}"></iframe>`;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Configuración</h1>
      <p className="page-subtitle">Definí cómo se paga una cita al reservar online.</p>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Política de pago y no-show</p>
        <p className="mt-1 text-xs text-ink/50">
          Si un cliente no asiste a una cita con seña o pago completo cobrado, ese monto no se
          reembolsa automáticamente.
        </p>

        {error && <p className="msg-error mt-3">{error}</p>}
        {saved && !error && <p className="msg-success mt-3">Política actualizada.</p>}

        <form action={updateDepositPolicyAction.bind(null, tenantSlug)} className="mt-4 space-y-4">
          <DepositPolicyFields
            defaultPolicy={tenant.depositPolicy}
            defaultType={tenant.depositType}
            defaultValue={tenant.depositValue?.toString() ?? null}
          />

          <SubmitButton icon={<ShieldCheck className="h-4 w-4" />} pendingLabel="Guardando…">
            Guardar política
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Widget / enlace para compartir</p>
        <p className="mt-1 text-xs text-ink/50">
          Compartí este link en redes o tu bio, o pegá el código en tu propio sitio para que
          reserven sin salir de tu página.
        </p>

        <div className="mt-4">
          <p className="field-label">Enlace para compartir</p>
          <div className="mt-1 flex items-center gap-2">
            <input readOnly value={shareUrl} className="field-input mt-0 font-mono text-xs" />
            <CopyButton value={shareUrl}>Copiar</CopyButton>
          </div>
        </div>

        <div className="mt-4">
          <p className="field-label">Insertar en tu sitio</p>
          <div className="mt-1 flex items-start gap-2">
            <textarea
              readOnly
              rows={2}
              value={embedSnippet}
              className="field-input mt-0 resize-none font-mono text-xs"
            />
            <CopyButton value={embedSnippet}>Copiar</CopyButton>
          </div>
        </div>

        <div className="mt-4">
          <p className="field-label">Vista previa</p>
          <iframe
            src={shareUrl}
            title="Vista previa del widget de reserva"
            className="mt-1 h-[500px] w-full rounded-lg border border-sage-dark/40"
          />
        </div>
      </div>
    </div>
  );
}
