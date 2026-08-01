import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyOfRolesInTenantLocations, hasAnyRoleInTenantLocations } from "@/lib/authorization";
import { logoutAction } from "./actions";

// Shell puramente presentacional (sidebar + logout) para todo lo que cuelga
// de dashboard/[tenantSlug]/*, incluyendo account-locked y plan-required.
// A propósito NO redirige por Tenant.status ni por rol — eso lo sigue
// haciendo cada página con su propio guard (requireDashboardAccess /
// requireOwnerAccess / etc.), igual que antes de este layout. Replicar acá
// el redirect a account-locked de requireDashboardAccess causaría un loop,
// porque este layout envuelve también a esa misma página.
export default async function DashboardShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { locations: true },
  });
  if (!tenant) notFound();
  if (session.user.tenantId !== tenant.id) notFound();

  const locationIds = tenant.locations.map((location) => location.id);
  const hasAccess = hasAnyRoleInTenantLocations(session.user.locationRoles, locationIds);
  if (!hasAccess) notFound();

  const hasReportsAccess = hasAnyOfRolesInTenantLocations(session.user.locationRoles, locationIds, [
    "OWNER",
    "ADMIN",
  ]);
  const hasOwnerAccess = hasAnyOfRolesInTenantLocations(session.user.locationRoles, locationIds, ["OWNER"]);
  const isLocked = tenant.status === "PAST_DUE" || tenant.status === "CANCELLED";

  const navItems = [
    { href: `/dashboard/${tenantSlug}`, label: "Agenda", show: true },
    { href: `/dashboard/${tenantSlug}/clients`, label: "Clientes", show: true },
    { href: `/dashboard/${tenantSlug}/inventory`, label: "Inventario", show: true },
    { href: `/dashboard/${tenantSlug}/professionals`, label: "Profesionales", show: hasReportsAccess },
    { href: `/dashboard/${tenantSlug}/services`, label: "Servicios", show: hasReportsAccess },
    { href: `/dashboard/${tenantSlug}/client-fields`, label: "Campos de ficha", show: hasReportsAccess },
    { href: `/dashboard/${tenantSlug}/reports`, label: "Reportes", show: hasReportsAccess },
    { href: `/dashboard/${tenantSlug}/team`, label: "Equipo", show: hasReportsAccess },
    { href: `/dashboard/${tenantSlug}/locations`, label: "Sedes", show: hasOwnerAccess },
    { href: `/dashboard/${tenantSlug}/billing`, label: "Facturación", show: hasOwnerAccess },
    { href: `/dashboard/${tenantSlug}/account`, label: "Mi cuenta", show: true },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col justify-between bg-pine text-paper md:w-60 md:shrink-0">
        <div>
          <div className="px-5 pb-2 pt-6">
            <p className="font-display text-lg font-semibold leading-tight">{tenant.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-paper/45">Plataforma Agenda</p>
          </div>
          {!isLocked && (
            <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-col md:overflow-visible">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-paper/75 transition-colors hover:bg-white/10 hover:text-paper"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-xs text-paper/55">{session.user.email}</p>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              className="text-xs text-paper/70 underline-offset-2 hover:text-paper hover:underline"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-10 md:px-12 md:py-12">{children}</main>
    </div>
  );
}
