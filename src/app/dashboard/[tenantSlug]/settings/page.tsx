import { Store, ShieldCheck, Star } from "lucide-react";
import { requireSettingsAccess } from "@/lib/auth-guards";
import { planIncludesModule } from "@/lib/planLimits";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { updateDepositPolicyAction, updateLoyaltyPolicyAction, updateMarketplaceListingAction } from "./actions";
import { DepositPolicyFields } from "./DepositPolicyFields";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    loyaltyError?: string;
    loyaltySaved?: string;
    marketplaceError?: string;
    marketplaceSaved?: string;
  }>;
}) {
  const { tenantSlug } = await params;
  const { error, saved, loyaltyError, loyaltySaved, marketplaceError, marketplaceSaved } = await searchParams;
  const { tenant } = await requireSettingsAccess(tenantSlug);
  const loyaltyModuleEnabled = planIncludesModule(tenant.plan, "loyalty");

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

      {loyaltyModuleEnabled && (
        <div className="mt-6 border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Fidelidad con sellos</p>
          <p className="mt-1 text-xs text-ink/50">
            Cada cita completada suma un sello. Al llegar al total, el cliente gana el premio —
            vos se lo canjeás desde su ficha.
          </p>

          {loyaltyError && <p className="msg-error mt-3">{loyaltyError}</p>}
          {loyaltySaved && !loyaltyError && <p className="msg-success mt-3">Política actualizada.</p>}

          <form action={updateLoyaltyPolicyAction.bind(null, tenantSlug)} className="mt-4 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="loyaltyEnabled"
                defaultChecked={tenant.loyaltyEnabled}
                className="field-checkbox"
              />
              Activar fidelidad con sellos
            </label>

            <div>
              <label className="field-label" htmlFor="loyaltyStampsRequired">
                Sellos para el premio
              </label>
              <input
                id="loyaltyStampsRequired"
                name="loyaltyStampsRequired"
                type="number"
                min={1}
                step={1}
                defaultValue={tenant.loyaltyStampsRequired}
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="loyaltyRewardDescription">
                Premio
              </label>
              <input
                id="loyaltyRewardDescription"
                name="loyaltyRewardDescription"
                type="text"
                placeholder="Ej: 1 sesión gratis"
                defaultValue={tenant.loyaltyRewardDescription ?? ""}
                className="field-input"
              />
            </div>

            <SubmitButton icon={<Star className="h-4 w-4" />} pendingLabel="Guardando…">
              Guardar política
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Marketplace</p>
        <p className="mt-1 text-xs text-ink/50">
          Si activás esto, tu negocio aparece en{" "}
          <a href="/explorar" target="_blank" rel="noreferrer" className="text-pine underline-offset-2 hover:underline">
            el directorio público de RIME
          </a>{" "}
          — cualquiera puede encontrarte y reservar desde ahí, además de tu link directo.
        </p>

        {marketplaceError && <p className="msg-error mt-3">{marketplaceError}</p>}
        {marketplaceSaved && !marketplaceError && <p className="msg-success mt-3">Cambios guardados.</p>}

        <form action={updateMarketplaceListingAction.bind(null, tenantSlug)} className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="marketplaceListed"
              defaultChecked={tenant.marketplaceListed}
              className="field-checkbox"
            />
            Listar mi negocio en el marketplace de RIME
          </label>

          <div>
            <label className="field-label" htmlFor="marketplaceDescription">
              Descripción corta (opcional)
            </label>
            <textarea
              id="marketplaceDescription"
              name="marketplaceDescription"
              rows={2}
              maxLength={160}
              placeholder="Ej: Consultas de psicología online y presenciales."
              defaultValue={tenant.marketplaceDescription ?? ""}
              className="field-input"
            />
          </div>

          <SubmitButton icon={<Store className="h-4 w-4" />} pendingLabel="Guardando…">
            Guardar
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
