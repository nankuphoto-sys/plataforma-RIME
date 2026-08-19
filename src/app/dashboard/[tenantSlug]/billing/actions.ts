"use server";

import { redirect } from "next/navigation";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { requireBillingAccess } from "@/lib/auth-guards";
import { getStripePriceId } from "@/lib/subscriptionPlans";
import { chargeTenantWompiSubscription } from "@/lib/wompiSubscriptionCharge";

const VALID_PLANS: readonly Plan[] = ["INDIVIDUAL", "BASICO", "PREMIUM", "PRO"];

export async function createSubscriptionCheckoutAction(tenantSlug: string): Promise<void> {
  const { session, tenant } = await requireBillingAccess(tenantSlug);

  let stripeCustomerId = tenant.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.user.email ?? undefined,
      name: tenant.name,
      metadata: { tenantId: tenant.id },
    });
    stripeCustomerId = customer.id;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: getStripePriceId(tenant.plan), quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/billing?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/billing?checkout=cancelled`,
    client_reference_id: tenant.id,
  });

  if (!checkoutSession.url) {
    redirect(
      `/dashboard/${tenantSlug}/billing?error=${encodeURIComponent("No se pudo iniciar el checkout. Intenta de nuevo.")}`
    );
  }

  redirect(checkoutSession.url);
}

export async function createBillingPortalSessionAction(tenantSlug: string): Promise<void> {
  const { tenant } = await requireBillingAccess(tenantSlug);

  if (!tenant.stripeCustomerId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=sin-suscripcion`);
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/billing`,
  });

  redirect(portalSession.url);
}

export async function changeSubscriptionPlanAction(tenantSlug: string, newPlan: Plan): Promise<void> {
  const { tenant } = await requireBillingAccess(tenantSlug);

  // Server Action invocable directo desde un <form> — no confiar en el tipo
  // de TypeScript solo, revalidar el valor como el resto del proyecto.
  if (!VALID_PLANS.includes(newPlan)) {
    redirect(`/dashboard/${tenantSlug}/billing?error=${encodeURIComponent("Plan inválido.")}`);
  }

  if (!tenant.stripeSubscriptionId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=sin-suscripcion`);
  }

  if (newPlan === tenant.plan) {
    redirect(`/dashboard/${tenantSlug}/billing?error=mismo-plan`);
  }

  const subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);

  // El checkout de createSubscriptionCheckoutAction siempre arma la
  // suscripción con exactamente un line_item, y nada más en el proyecto la
  // modifica — así que en la práctica esto nunca debería fallar. Se valida
  // igual explícitamente: si alguna vez la suscripción no tuviera
  // exactamente un ítem, pasar `id: undefined` a `items: [{ id, price }]`
  // haría que Stripe lo interprete como "agregar un ítem nuevo" en vez de
  // "actualizar el existente" — mejor fallar acá con un error claro que
  // arriesgarse a duplicar líneas de facturación.
  if (subscription.items.data.length !== 1) {
    redirect(
      `/dashboard/${tenantSlug}/billing?error=${encodeURIComponent(
        "No se pudo cambiar el plan: la suscripción de Stripe no tiene la forma esperada. Contacta soporte."
      )}`
    );
  }
  const subscriptionItemId = subscription.items.data[0]!.id;

  await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
    items: [{ id: subscriptionItemId, price: getStripePriceId(newPlan) }],
    proration_behavior: "create_prorations",
  });

  // Tenant.plan NO se actualiza acá de forma optimista: la única fuente de
  // verdad es el webhook customer.subscription.updated.
  redirect(`/dashboard/${tenantSlug}/billing?checkout=plan-changed`);
}

export async function changeWompiSubscriptionPlanAction(tenantSlug: string, newPlan: Plan): Promise<void> {
  const { tenant } = await requireBillingAccess(tenantSlug);

  if (!VALID_PLANS.includes(newPlan)) {
    redirect(`/dashboard/${tenantSlug}/billing?error=${encodeURIComponent("Plan inválido.")}`);
  }

  if (!tenant.wompiPaymentSourceId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=sin-suscripcion`);
  }

  if (newPlan === tenant.plan) {
    redirect(`/dashboard/${tenantSlug}/billing?error=mismo-plan`);
  }

  // A diferencia de Stripe, acá no hay ningún objeto de "suscripción" del
  // lado de Wompi que actualizar: chargeTenantWompiSubscription siempre lee
  // el precio a cobrar desde `tenant.plan` en el momento del cobro (ver
  // getWompiPriceInCents, llamado con `tenant.plan` justo antes de armar la
  // transacción). Por eso acá alcanza con actualizar `Tenant.plan`
  // directamente — es la única fuente de verdad, a diferencia de Stripe
  // donde el webhook `customer.subscription.updated` es quien manda.
  //
  // Decisión de producto explícita: el cambio de ACCESO (feature-gating vía
  // planIncludesModule/hasReachedLocationLimit/etc., que leen `tenant.plan`
  // en cada request) es inmediato, pero NO hay prorrateo financiero — el
  // próximo cobro programado (`wompiNextChargeAt`) va a cobrar el monto
  // completo del plan nuevo, sin acreditar ni cobrar la diferencia de lo que
  // quedaba del ciclo actual. Wompi no ofrece acá un mecanismo de crédito/
  // nota de crédito equivalente a `proration_behavior: "create_prorations"`
  // de Stripe, y construirlo a mano (calcular el prorrateo y disparar un
  // cobro o reembolso adicional) queda fuera de esta fase.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: newPlan } });

  redirect(`/dashboard/${tenantSlug}/billing?checkout=wompi-plan-changed`);
}

export async function cancelWompiSubscriptionAction(tenantSlug: string): Promise<void> {
  const { tenant } = await requireBillingAccess(tenantSlug);

  if (!tenant.wompiPaymentSourceId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=sin-suscripcion`);
  }

  // No se llama a PUT /payment_sources/{id}/void: verificado contra la API
  // real de Wompi (sandbox) que ese endpoint solo aplica a payment_sources
  // de tipo PREAUTHORIZATION (responde 422 para un CARD normal como el que
  // usamos acá). Wompi no ofrece una forma pública de invalidar un
  // payment_source de cobro directo, así que la cancelación se hace 100% de
  // nuestro lado: como wompiNextChargeAt queda en null y nunca se
  // reprograma solo (sin reactivación automática en esta fase), el cron de
  // cobro nunca vuelve a tomar este tenant. wompiPaymentSourceId queda
  // guardado sin usarse — no hace falta borrarlo.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: "CANCELLED", wompiNextChargeAt: null },
  });

  redirect(`/dashboard/${tenantSlug}/billing?checkout=wompi-cancelado`);
}

// Reactivación tras CANCELLED para tenants de Wompi. `wompiPaymentSourceId`
// nunca se borra al cancelar (ver cancelWompiSubscriptionAction) y Wompi no
// ofrece forma de invalidarlo del lado suyo, así que en la práctica sigue
// siendo cobrable — reactivar es simplemente reintentar un cobro con
// chargeTenantWompiSubscription, la misma lógica compartida que usa el cron
// mensual y el primer cobro al configurar.
export async function reactivateWompiSubscriptionAction(tenantSlug: string): Promise<void> {
  const { tenant } = await requireBillingAccess(tenantSlug);

  if (tenant.status !== "CANCELLED") {
    redirect(`/dashboard/${tenantSlug}/billing?error=${encodeURIComponent("Tu cuenta no está cancelada.")}`);
  }

  if (!tenant.wompiPaymentSourceId) {
    // No debería pasar (canceled implica que en algún momento se configuró),
    // pero por las dudas: sin tarjeta guardada no hay nada que reintentar.
    redirect(`/dashboard/${tenantSlug}/billing/wompi-setup`);
  }

  // Reactivar arranca un ciclo de reintentos nuevo, tan generoso como el de
  // cualquier cobro normal — si NO reseteáramos esto, un rechazo en este
  // mismo intento encontraría `wompiRetryCount` ya en el tope de la
  // cancelación anterior y volvería a cancelar al toque (ver
  // handleSubscriptionChargeUpdate en el webhook de Wompi) en vez de darle
  // la escalera completa de reintentos (+2/+4/+7 días) como a cualquier
  // cliente nuevo.
  const resetTenant = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { wompiRetryCount: 0, wompiFirstFailedAt: null },
  });

  // `status` NO se actualiza acá de forma optimista — sigue en CANCELLED
  // hasta que el webhook confirme el resultado real de este cobro (mismo
  // principio que el resto de los flujos de pago del proyecto). Si el
  // cobro queda aprobado, el webhook lo pasa a ACTIVE solo.
  const result = await chargeTenantWompiSubscription(resetTenant);

  if (!result.approved) {
    redirect(
      `/dashboard/${tenantSlug}/billing?error=${encodeURIComponent(
        "No se pudo iniciar el cobro de reactivación. Prueba de nuevo en unos minutos."
      )}`
    );
  }

  redirect(`/dashboard/${tenantSlug}/billing?checkout=wompi-reactivando`);
}
