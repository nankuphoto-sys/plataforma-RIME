import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  CreditCard,
  LogOut,
  MapPin,
  Package,
  User,
  UserCog,
  Users,
  Users2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyOfRolesInTenantLocations, hasAnyRoleInTenantLocations } from "@/lib/authorization";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { NavLink } from "@/components/ui/NavLink";
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

  const dashboardRoot = `/dashboard/${tenantSlug}`;

  const navItems: { href: string; label: string; show: boolean; icon: LucideIcon }[] = [
    { href: dashboardRoot, label: "Agenda", show: true, icon: Calendar },
    { href: `${dashboardRoot}/clients`, label: "Clientes", show: true, icon: Users },
    { href: `${dashboardRoot}/inventory`, label: "Inventario", show: true, icon: Package },
    {
      href: `${dashboardRoot}/professionals`,
      label: "Profesionales",
      show: hasReportsAccess,
      icon: UserCog,
    },
    {
      href: `${dashboardRoot}/services`,
      label: "Servicios",
      show: hasReportsAccess,
      icon: Wrench,
    },
    {
      href: `${dashboardRoot}/client-fields`,
      label: "Campos de ficha",
      show: hasReportsAccess,
      icon: ClipboardList,
    },
    { href: `${dashboardRoot}/reports`, label: "Reportes", show: hasReportsAccess, icon: BarChart3 },
    { href: `${dashboardRoot}/team`, label: "Equipo", show: hasReportsAccess, icon: Users2 },
    { href: `${dashboardRoot}/locations`, label: "Sedes", show: hasOwnerAccess, icon: MapPin },
    { href: `${dashboardRoot}/billing`, label: "Facturación", show: hasOwnerAccess, icon: CreditCard },
    { href: `${dashboardRoot}/account`, label: "Mi cuenta", show: true, icon: User },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col justify-between bg-pine text-paper md:w-60 md:shrink-0">
        <div>
          <div className="px-5 pb-2 pt-6">
            <p className="font-display text-lg font-semibold leading-tight">{tenant.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-paper/45">RIME</p>
          </div>
          {!isLocked && (
            <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-col md:overflow-visible">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  exact={item.href === dashboardRoot}
                  className="nav-link"
                  activeClassName="nav-link-active"
                >
                  <item.icon className="h-4 w-4" strokeWidth={2} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-xs text-paper/55">{session.user.email}</p>
          <form action={logoutAction} className="mt-2">
            <SubmitButton
              icon={<LogOut className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:scale-110" />}
              pendingLabel="Cerrando sesión…"
              className="group flex items-center gap-1.5 text-xs text-paper/70 underline-offset-2 transition-colors hover:text-paper hover:underline active:scale-[0.98]"
            >
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-10 md:px-12 md:py-12">{children}</main>
    </div>
  );
}
