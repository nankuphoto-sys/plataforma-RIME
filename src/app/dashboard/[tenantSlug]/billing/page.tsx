import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/auth-guards";
import { getPlanLimits } from "@/lib/planLimits";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";
import {
  createSubscriptionCheckoutAction,
  createBillingPortalSessionAction,
  changeSubscriptionPlanAction,
  cancelWompiSubscriptionAction,
} from "./actions";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { checkout, error } = await searchParams;
  const { tenant } = await requireBillingAccess(tenantSlug);

  const [locationCount, activeProfessionalCount] = tenant.stripeSubscriptionId
    ? await Promise.all([
        prisma.location.count({ where: { tenantId: tenant.id } }),
        prisma.professional.count({ where: { tenantId: tenant.id, active: true } }),
      ])
    : [0, 0];

  const hasWompiSubscription = Boolean(tenant.wompiPaymentSourceId);
  const hasStripeSubscription = Boolean(tenant.stripeSubscriptionId);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Facturación</h1>

      {checkout === "success" && <p className="msg-success mt-4">Suscripción configurada correctamente.</p>}
      {checkout === "cancelled" && <p className="mt-4 text-sm text-ink/50">Checkout cancelado.</p>}
      {checkout === "plan-changed" && (
        <p className="msg-success mt-4">
          Cambio de plan enviado. Puede tardar unos segundos en reflejarse mientras Stripe confirma el cambio.
        </p>
      )}
      {checkout === "wompi-configurado" && (
        <p className="msg-success mt-4">
          Tarjeta guardada. El primer cobro puede tardar unos segundos en reflejarse mientras Wompi lo confirma.
        </p>
      )}
      {checkout === "wompi-cancelado" && <p className="msg-success mt-4">Suscripción de Wompi cancelada.</p>}
      {error === "sin-suscripcion" && (
        <p className="msg-error mt-4">Todavía no hay ninguna suscripción configurada para gestionar.</p>
      )}
      {error === "mismo-plan" && <p className="msg-error mt-4">Ya estás en ese plan.</p>}
      {error === "ya-tenes-stripe" && (
        <p className="msg-error mt-4">Ya tenés una suscripción de Stripe activa — no podés configurar Wompi a la vez.</p>
      )}
      {error === "tarjeta-rechazada" && (
        <p className="msg-error mt-4">No se pudo guardar la tarjeta. Intenta de nuevo.</p>
      )}
      {error &&
        !["sin-suscripcion", "mismo-plan", "ya-tenes-stripe", "tarjeta-rechazada"].includes(error) && (
          <p className="msg-error mt-4">{error}</p>
        )}

      <div className="panel mt-6 space-y-1 text-sm">
        <p className="text-ink/70">
          Plan actual: <span className="font-medium text-ink">{tenant.plan}</span>
        </p>
        <p className="text-ink/70">
          Estado: <span className="font-medium text-ink">{tenant.status}</span>
        </p>
      </div>

      {!hasWompiSubscription && (
        <div className="mt-6">
          {!hasStripeSubscription ? (
            <form action={createSubscriptionCheckoutAction.bind(null, tenantSlug)}>
              <button type="submit" className="btn-primary">
                Configurar cobro automático
              </button>
            </form>
          ) : (
            <form action={createBillingPortalSessionAction.bind(null, tenantSlug)}>
              <button type="submit" className="btn-secondary">
                Gestionar suscripción / actualizar método de pago
              </button>
            </form>
          )}
        </div>
      )}

      {tenant.stripeSubscriptionId && (
        <section className="mt-10 border-t border-sage-dark/30 pt-6">
          <h2 className="section-title">Cambiar de plan</h2>
          <p className="mt-2 text-sm text-ink/55">
            El cambio aplica de inmediato. Si subís de plan, Stripe cobra la diferencia prorrateada
            ahora; si bajás, te acredita la diferencia en tu próxima factura.
          </p>

          <div className="mt-4 space-y-3">
            {PLAN_OPTIONS.map((option) => {
              const isCurrent = option.value === tenant.plan;
              const { maxLocations, maxProfessionals } = getPlanLimits(option.value);
              const overLocations = maxLocations !== null && locationCount > maxLocations;
              const overProfessionals = maxProfessionals !== null && activeProfessionalCount > maxProfessionals;

              return (
                <div key={option.value} className="panel flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {option.label}
                      {isCurrent && <span className="badge badge-pine ml-2">Plan actual</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/50">{describePlan(option)}</p>
                    {!isCurrent && (overLocations || overProfessionals) && (
                      <p className="mt-2 text-xs text-berry-dark">
                        Hoy tenés {locationCount} sede{locationCount === 1 ? "" : "s"} /{" "}
                        {activeProfessionalCount} profesional{activeProfessionalCount === 1 ? "" : "es"}{" "}
                        activo{activeProfessionalCount === 1 ? "" : "s"}, más de lo que incluye este plan.
                        No se desactiva nada solo, pero no vas a poder agregar más hasta bajar de esa
                        cifra.
                      </p>
                    )}
                  </div>
                  {!isCurrent && (
                    <form action={changeSubscriptionPlanAction.bind(null, tenantSlug, option.value)}>
                      <button type="submit" className="btn-secondary-sm whitespace-nowrap">
                        Cambiar a {option.label}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasStripeSubscription && (
        <section className="mt-10 border-t border-sage-dark/30 pt-6">
          <h2 className="section-title">Wompi (Colombia)</h2>
          {!hasWompiSubscription ? (
            <div className="mt-4">
              <Link href={`/dashboard/${tenantSlug}/billing/wompi-setup`} className="btn-primary">
                Configurar cobro automático (Wompi)
              </Link>
            </div>
          ) : (
            <div className="panel mt-4 space-y-2 text-sm">
              <p className="text-ink/70">
                Tarjeta terminada en{" "}
                <span className="data-mono font-medium text-ink">{tenant.wompiCardLastFour ?? "----"}</span>
              </p>
              {(tenant.status === "ACTIVE" || tenant.status === "PAST_DUE") && tenant.wompiNextChargeAt && (
                <p className="text-ink/70">
                  Próximo cobro:{" "}
                  <span className="data-mono font-medium text-ink">
                    {tenant.wompiNextChargeAt.toLocaleDateString("es-CO")}
                  </span>
                </p>
              )}
              {tenant.status !== "CANCELLED" && (
                <form action={cancelWompiSubscriptionAction.bind(null, tenantSlug)} className="pt-2">
                  <button type="submit" className="btn-secondary-sm">
                    Cancelar suscripción
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
