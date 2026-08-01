import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/appointmentStatus";
import { getPlanFromStripePriceId } from "@/lib/subscriptionPlans";

// Desde la API de Stripe 2025-03-31, Invoice ya no trae `subscription` como
// campo directo — vive en parent.subscription_details.subscription.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma del webhook." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Firma inválida: no procesar nada — podría ser una petición falsificada.
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Suscripción del SaaS (cobro recurrente del tenant, no un pago de cita
    // de cliente final) — se distingue por mode: "subscription" +
    // client_reference_id (el id del Tenant, seteado en
    // createSubscriptionCheckoutAction).
    if (session.mode === "subscription" && session.client_reference_id) {
      const tenant = await prisma.tenant.findUnique({ where: { id: session.client_reference_id } });
      if (tenant) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripeSubscriptionId:
              typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
            status: "ACTIVE",
          },
        });
      }
      return NextResponse.json({ received: true });
    }

    const payment = await prisma.payment.findFirst({
      where: { providerRef: session.id },
    });

    // Puede ser un evento de otro ambiente (dev/staging) apuntando a la misma
    // cuenta de Stripe — no hacemos fallar el webhook por esto.
    if (!payment) {
      return NextResponse.json({ received: true });
    }

    // Idempotencia: Stripe puede reenviar el mismo evento más de una vez.
    if (payment.status !== "PAID") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "PAID", confirmedAt: new Date() },
        });

        const appointment = await tx.appointment.findUnique({
          where: { id: payment.appointmentId },
        });

        if (appointment && ALLOWED_STATUS_TRANSITIONS[appointment.status].includes("CONFIRMED")) {
          await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: "CONFIRMED" },
          });
        }
      });
    }
  } else if (event.type === "invoice.paid") {
    // También cubre la recuperación automática de un PAST_DUE cuando el
    // reintento de Stripe finalmente cobra bien.
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (subscriptionId) {
      await prisma.tenant.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { status: "ACTIVE" },
      });
    }
  } else if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (subscriptionId) {
      await prisma.tenant.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { status: "PAST_DUE" },
      });
    }
  } else if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await prisma.tenant.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: "CANCELLED" },
    });
  } else if (event.type === "customer.subscription.updated") {
    // Única fuente de verdad para Tenant.plan tras un cambio de plan
    // (changeSubscriptionPlanAction no lo actualiza de forma optimista).
    // Nunca toca `status` acá — eso lo maneja exclusivamente invoice.paid /
    // invoice.payment_failed / customer.subscription.deleted.
    const subscription = event.data.object as Stripe.Subscription;
    const priceId = subscription.items.data[0]?.price.id;
    const plan = priceId ? getPlanFromStripePriceId(priceId) : null;
    if (plan) {
      await prisma.tenant.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { plan },
      });
    }
  }

  return NextResponse.json({ received: true });
}
