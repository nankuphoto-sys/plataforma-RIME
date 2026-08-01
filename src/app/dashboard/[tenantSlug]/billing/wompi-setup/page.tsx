import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBillingAccess } from "@/lib/auth-guards";

export default async function WompiSetupPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireBillingAccess(tenantSlug);

  // Exclusión mutua: un tenant usa Stripe O Wompi, nunca ambos a la vez.
  if (tenant.stripeSubscriptionId) {
    redirect(`/dashboard/${tenantSlug}/billing?error=ya-tenes-stripe`);
  }

  const publicKey = process.env.WOMPI_PUBLIC_KEY;

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/billing`} className="shell-link">
        ← Volver a facturación
      </Link>
      <h1 className="page-title mt-3">Configurar cobro automático (Wompi)</h1>
      <p className="page-subtitle">
        Guardá tu tarjeta de forma segura con Wompi. Nunca vemos ni tocamos el número de tu tarjeta —
        el widget lo maneja directamente con Wompi.
      </p>

      {!publicKey ? (
        <p className="msg-error mt-6">Wompi no está configurado.</p>
      ) : (
        <form method="POST" action="/api/wompi/tokenize-callback" className="mt-6">
          <input type="hidden" name="tenantSlug" value={tenantSlug} />
          <script
            defer
            src="https://checkout.wompi.co/widget.js"
            data-render="button"
            data-widget-operation="tokenize"
            data-public-key={publicKey}
          />
        </form>
      )}
    </div>
  );
}
