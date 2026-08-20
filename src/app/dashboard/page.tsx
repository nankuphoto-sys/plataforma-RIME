import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Entrada genérica sin tenant en la URL — a la que redirige el login/registro
// con Google (signInWithGoogleAction en src/app/login/actions.ts), que no
// puede calcular el slug del tenant de antemano porque corre ANTES del
// round-trip a Google. Resuelve el tenant de la sesión recién creada y
// redirige a /dashboard/[tenantSlug], donde requireDashboardAccess hace el
// resto de los chequeos de siempre (status del tenant, roles, etc.).
export default async function DashboardEntryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { slug: true },
  });
  if (!tenant) redirect("/login");

  redirect(`/dashboard/${tenant.slug}`);
}
