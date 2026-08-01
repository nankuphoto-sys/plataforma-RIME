import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBillingPortalSessionAction } from "../billing/actions";

// Esta página NO puede usar requireDashboardAccess: ese guard redirige acá
// mismo cuando el tenant está PAST_DUE/CANCELLED, así que reusarlo
// causaría un loop infinito de redirects. Chequeo propio, liviano: sesión
// válida + que el tenant de la URL sea el del usuario — sin verificar rol
// ni status (para eso está esta página).
export default async function AccountLockedPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();
  if (session.user.tenantId !== tenant.id) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Cuenta bloqueada</h1>
      <p className="mt-4 text-sm text-ink/60">
        Tu cuenta está {tenant.status === "PAST_DUE" ? "con un pago pendiente" : "cancelada"}.
        {tenant.stripeCustomerId
          ? " Actualiza tu método de pago para reactivarla."
          : " Contacta a soporte para reactivarla."}
      </p>

      {tenant.stripeCustomerId && (
        <form action={createBillingPortalSessionAction.bind(null, tenantSlug)} className="mt-4">
          <button type="submit" className="btn-primary">
            Actualizar método de pago
          </button>
        </form>
      )}
    </div>
  );
}
