import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/auth-guards";
import { getWompiAcceptanceTokens, getWompiApiBaseUrl } from "@/lib/wompi";
import { chargeTenantWompiSubscription } from "@/lib/wompiSubscriptionCharge";

interface WompiPaymentSourceResponse {
  data?: {
    id: number;
    status: string;
    public_data?: { last_four?: string };
  };
}

// POST de formulario HTML normal del widget de Wompi (modo tokenize), no una
// Server Action — por eso es un Route Handler y no vive en billing/actions.ts.
export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const tenantSlug = formData.get("tenantSlug")?.toString() ?? "";
  const token = formData.get("payment_source_token")?.toString() ?? "";

  const { session, tenant } = await requireBillingAccess(tenantSlug);

  // Exclusión mutua: un tenant usa Stripe O Wompi, nunca ambos a la vez.
  if (tenant.stripeSubscriptionId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=ya-tenes-stripe`);
  }

  if (!token) {
    redirect(`/dashboard/${tenantSlug}/billing?error=tarjeta-rechazada`);
  }

  const { acceptanceToken, personalDataAuthToken } = await getWompiAcceptanceTokens();

  const response = await fetch(`${getWompiApiBaseUrl()}/payment_sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
    },
    body: JSON.stringify({
      type: "CARD",
      token,
      customer_email: session.user.email ?? "",
      acceptance_token: acceptanceToken,
      accept_personal_auth: personalDataAuthToken,
    }),
  });

  const body = (await response.json()) as WompiPaymentSourceResponse;

  if (!response.ok || body.data?.status !== "AVAILABLE") {
    redirect(`/dashboard/${tenantSlug}/billing?error=tarjeta-rechazada`);
  }

  const updatedTenant = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      wompiPaymentSourceId: String(body.data.id),
      wompiCardLastFour: body.data.public_data?.last_four ?? null,
    },
  });

  // Mismo comportamiento que Stripe: cobra apenas se configura. El
  // resultado (aprobado/rechazado) se refleja cuando llegue el webhook.
  await chargeTenantWompiSubscription(updatedTenant);

  redirect(`/dashboard/${tenantSlug}/billing?checkout=wompi-configurado`);
}
