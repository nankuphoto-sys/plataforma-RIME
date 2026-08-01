"use server";

import { redirect } from "next/navigation";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { requireBillingAccess } from "@/lib/auth-guards";
import { getStripePriceId } from "@/lib/subscriptionPlans";

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
  const subscriptionItemId = subscription.items.data[0]?.id;

  await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
    items: [{ id: subscriptionItemId, price: getStripePriceId(newPlan) }],
    proration_behavior: "create_prorations",
  });

  // Tenant.plan NO se actualiza acá de forma optimista: la única fuente de
  // verdad es el webhook customer.subscription.updated.
  redirect(`/dashboard/${tenantSlug}/billing?checkout=plan-changed`);
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
