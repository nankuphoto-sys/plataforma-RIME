import Link from "next/link";
import { ArrowRightLeft, Banknote, CreditCard, RefreshCw, Settings, Wallet, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/auth-guards";
import { getPlanLimits } from "@/lib/planLimits";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  TRIAL: "Prueba gratis",
  PAST_DUE: "Pago pendiente",
  CANCELLED: "Cancelada",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "badge-pine",
  TRIAL: "badge-gold",
  PAST_DUE: "badge-berry",
  CANCELLED: "badge-sage",
};
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  createSubscriptionCheckoutAction,
  createBillingPortalSessionAction,
  changeSubscriptionPlanAction,
  changeWompiSubscriptionPlanAction,
  cancelWompiSubscriptionAction,
  reactivateWompiSubscriptionAction,
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

  const hasWompiSubscription = Boolean(tenant.wompiPaymentSourceId);
  const hasStripeSubscription = Boolean(tenant.stripeSubscriptionId);
  // Mutuamente excluyentes (un tenant no puede tener las dos a la vez — ver
  // el error "ya-tenes-stripe" más abajo), así que alcanza con "cualquiera
  // de las dos" para decidir si mostrar la sección de cambio de plan.
  const hasAnySubscription = hasStripeSubscription || hasWompiSubscription;
  // `stripeSubscriptionId` NUNCA se borra cuando Stripe cancela la
  // suscripción (customer.subscription.deleted solo toca `status`, ver
  // webhook) — así que "tiene stripeSubscriptionId" no alcanza para saber
  // si la suscripción sigue viva. Si el tenant quedó CANCELLED, esa
  // suscripción vieja ya está muerta del lado de Stripe y no se puede
  // reactivar vía Billing Portal: hay que armar un Checkout nuevo (mismo
  // botón que la primera vez), que Stripe permite sin problema para un
  // customer que ya tuvo una suscripción anterior.
  const stripeNeedsReactivation = hasStripeSubscription && tenant.status === "CANCELLED";

  const [locationCount, activeProfessionalCount] = hasAnySubscription
    ? await Promise.all([
        prisma.location.count({ where: { tenantId: tenant.id } }),
        prisma.professional.count({ where: { tenantId: tenant.id, active: true } }),
      ])
    : [0, 0];

  return (
    <div className="mx-auto max-w-2xl">
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
      {checkout === "wompi-plan-changed" && (
        <p className="msg-success mt-4">
          Plan actualizado. Tu próximo cobro automático por Wompi va a salir con el monto del plan
          nuevo (sin prorrateo por lo que quedaba del ciclo actual).
        </p>
      )}
      {checkout === "wompi-reactivando" && (
        <p className="msg-success mt-4">
          Reactivación en camino. Puede tardar unos segundos en reflejarse mientras Wompi confirma
          el cobro.
        </p>
      )}
      {error === "sin-suscripcion" && (
        <p className="msg-error mt-4">Todavía no hay ninguna suscripción configurada para gestionar.</p>
      )}
      {error === "mismo-plan" && <p className="msg-error mt-4">Ya estás en ese plan.</p>}
      {error === "ya-tenes-stripe" && (
        <p className="msg-error mt-4">Ya tienes una suscripción de Stripe activa — no puedes configurar Wompi a la vez.</p>
      )}
      {error === "tarjeta-rechazada" && (
        <p className="msg-error mt-4">No se pudo guardar la tarjeta. Intenta de nuevo.</p>
      )}
      {error &&
        !["sin-suscripcion", "mismo-plan", "ya-tenes-stripe", "tarjeta-rechazada"].includes(error) && (
          <p className="msg-error mt-4">{error}</p>
        )}

      <div className="panel mt-6 flex items-center gap-4">
        <span
          className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
          aria-hidden
        >
          <CreditCard className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-2xl font-bold text-ink">
              {PLAN_OPTIONS.find((o) => o.value === tenant.plan)?.label ?? tenant.plan}
            </p>
            <span className={`badge ${STATUS_BADGE[tenant.status] ?? "badge-sage"}`}>
              {STATUS_LABEL[tenant.status] ?? tenant.status}
            </span>
          </div>
          {(() => {
            const current = PLAN_OPTIONS.find((o) => o.value === tenant.plan);
            return (
              <p className="mt-1 text-sm text-ink/55">
                {current ? describePlan(current) : "Plan personalizado"}
              </p>
            );
          })()}
        </div>
      </div>

      {!hasWompiSubscription && (
        <div className="mt-6">
          {!hasStripeSubscription || stripeNeedsReactivation ? (
            <form action={createSubscriptionCheckoutAction.bind(null, tenantSlug)}>
              <SubmitButton
                icon={
                  stripeNeedsReactivation ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )
                }
                pendingLabel={stripeNeedsReactivation ? "Reactivando…" : "Configurando…"}
              >
                {stripeNeedsReactivation ? "Reactivar suscripción (Stripe)" : "Configurar cobro automático (Stripe)"}
              </SubmitButton>
            </form>
          ) : (
            <form action={createBillingPortalSessionAction.bind(null, tenantSlug)}>
              <SubmitButton icon={<Settings className="h-4 w-4" />} pendingLabel="Abriendo…" className="btn-secondary">
                Gestionar suscripción / actualizar método de pago
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {hasAnySubscription && tenant.status !== "CANCELLED" && (
        <section className="mt-10 border-t border-sage-dark/30 pt-6">
          <h2 className="section-title">Cambiar de plan</h2>
          <p className="mt-2 text-sm text-ink/55">
            {hasStripeSubscription
              ? "El cambio aplica de inmediato. Si subes de plan, Stripe cobra la diferencia prorrateada ahora; si bajas, te acredita la diferencia en tu próxima factura."
              : "El cambio de acceso aplica de inmediato. A diferencia de Stripe, acá no hay prorrateo: tu próximo cobro automático por Wompi ya sale con el monto completo del plan nuevo, sin ajustar por lo que quedaba del ciclo actual."}
          </p>

          <div className="mt-4 space-y-3">
            {PLAN_OPTIONS.map((option) => {
              const isCurrent = option.value === tenant.plan;
              const { maxLocations, maxProfessionals } = getPlanLimits(option.value);
              const overLocations = maxLocations !== null && locationCount > maxLocations;
              const overProfessionals = maxProfessionals !== null && activeProfessionalCount > maxProfessionals;
              const changePlanAction = hasStripeSubscription
                ? changeSubscriptionPlanAction
                : changeWompiSubscriptionPlanAction;

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
                        Hoy tienes {locationCount} sede{locationCount === 1 ? "" : "s"} /{" "}
                        {activeProfessionalCount} profesional{activeProfessionalCount === 1 ? "" : "es"}{" "}
                        activo{activeProfessionalCount === 1 ? "" : "s"}, más de lo que incluye este plan.
                        No se desactiva nada solo, pero no vas a poder agregar más hasta bajar de esa
                        cifra.
                      </p>
                    )}
                  </div>
                  {!isCurrent && (
                    <form action={changePlanAction.bind(null, tenantSlug, option.value)}>
                      <SubmitButton
                        icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                        pendingLabel="Cambiando…"
                        className="btn-secondary-sm whitespace-nowrap"
                      >
                        Cambiar a {option.label}
                      </SubmitButton>
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
                <CreditCard className="h-4 w-4" />
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
              {tenant.status === "CANCELLED" ? (
                <form action={reactivateWompiSubscriptionAction.bind(null, tenantSlug)} className="pt-2">
                  <SubmitButton
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    pendingLabel="Reactivando…"
                    className="btn-secondary-sm"
                  >
                    Reactivar suscripción
                  </SubmitButton>
                </form>
              ) : (
                <form action={cancelWompiSubscriptionAction.bind(null, tenantSlug)} className="pt-2">
                  <SubmitButton
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    pendingLabel="Cancelando…"
                    className="btn-secondary-sm"
                  >
                    Cancelar suscripción
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {/* Addi y Sistecrédito: solo interfaz, sin integración real todavía —
          no hay credenciales de ninguno de los dos. Mismo patrón que el
          prototipo de diseño original (RIME Landing.dc.html), pero acá se
          marca explícitamente "Próximamente" en vez de simular un cobro
          exitoso: esta pantalla la usa un dueño de negocio real, y fingir
          que quedó configurado sería engañoso. */}
      <section className="mt-10 border-t border-sage-dark/30 pt-6">
        <div className="flex items-center gap-2">
          <h2 className="section-title">Addi</h2>
          <span className="badge badge-sage">Próximamente</span>
        </div>
        <p className="mt-2 text-sm text-ink/55">
          Cobro recurrente financiado a través de Addi. Todavía no está conectado — esto es solo la
          interfaz.
        </p>
        <div className="mt-4">
          <button type="button" disabled className="btn-secondary">
            <Banknote className="h-4 w-4" />
            Configurar cobro automático (Addi)
          </button>
        </div>
      </section>

      <section className="mt-10 border-t border-sage-dark/30 pt-6">
        <div className="flex items-center gap-2">
          <h2 className="section-title">Sistecrédito</h2>
          <span className="badge badge-sage">Próximamente</span>
        </div>
        <p className="mt-2 text-sm text-ink/55">
          Cobro recurrente financiado a través de Sistecrédito. Todavía no está conectado — esto es
          solo la interfaz.
        </p>
        <div className="mt-4">
          <button type="button" disabled className="btn-secondary">
            <Wallet className="h-4 w-4" />
            Configurar cobro automático (Sistecrédito)
          </button>
        </div>
      </section>
    </div>
  );
}
