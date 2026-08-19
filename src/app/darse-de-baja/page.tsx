import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { unsubscribeAction } from "./actions";

function UnsubscribeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <Link href="/" className="auth-brand transition-opacity hover:opacity-80">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-paper">RIME</span>
        </Link>
        <div className="auth-card">{children}</div>
      </div>
    </main>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; tenant?: string; done?: string; error?: string }>;
}) {
  const { client: clientId, tenant: tenantSlug, done, error } = await searchParams;

  if (error || !clientId || !tenantSlug) {
    return (
      <UnsubscribeShell>
        <h1 className="page-title text-2xl">Link inválido</h1>
        <p className="page-subtitle">Este link para darte de baja no es válido.</p>
      </UnsubscribeShell>
    );
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant: { slug: tenantSlug } },
    include: { tenant: true },
  });

  if (!client) {
    return (
      <UnsubscribeShell>
        <h1 className="page-title text-2xl">Link inválido</h1>
        <p className="page-subtitle">Este link para darte de baja no es válido.</p>
      </UnsubscribeShell>
    );
  }

  if (done === "1" || client.marketingOptOut) {
    return (
      <UnsubscribeShell>
        <h1 className="page-title text-2xl">Listo</h1>
        <p className="page-subtitle">No vas a recibir más novedades de {client.tenant.name}.</p>
        <p className="mt-5 text-center text-sm text-ink/50">
          <Link href="/" className="text-pine underline-offset-2 hover:underline">
            Volver al inicio
          </Link>
        </p>
      </UnsubscribeShell>
    );
  }

  return (
    <UnsubscribeShell>
      <h1 className="page-title text-2xl">¿Dejar de recibir novedades?</h1>
      <p className="page-subtitle">
        Vas a dejar de recibir emails de marketing de {client.tenant.name}. Sigues pudiendo reservar
        citas normalmente.
      </p>
      <form action={unsubscribeAction.bind(null, clientId, tenantSlug)} className="mt-6">
        <button type="submit" className="btn-primary w-full">
          Sí, darme de baja
        </button>
      </form>
    </UnsubscribeShell>
  );
}
