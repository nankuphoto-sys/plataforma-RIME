import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  CreditCard,
  Gift,
  LogOut,
  MapPin,
  Megaphone,
  Package,
  ShieldCheck,
  Star,
  User,
  UserCog,
  Users,
  Users2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getSessionAndTenant } from "@/lib/auth-guards";
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

  const { session, tenant } = await getSessionAndTenant(tenantSlug);
  if (!session?.user) redirect("/login");
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
    { href: `${dashboardRoot}/reviews`, label: "Reseñas", show: hasReportsAccess, icon: Star },
    { href: `${dashboardRoot}/gift-cards`, label: "Gift cards", show: hasReportsAccess, icon: Gift },
    { href: `${dashboardRoot}/marketing`, label: "Marketing", show: hasReportsAccess, icon: Megaphone },
    { href: `${dashboardRoot}/team`, label: "Equipo", show: hasReportsAccess, icon: Users2 },
    { href: `${dashboardRoot}/locations`, label: "Sedes", show: hasOwnerAccess, icon: MapPin },
    { href: `${dashboardRoot}/billing`, label: "Facturación", show: hasOwnerAccess, icon: CreditCard },
    { href: `${dashboardRoot}/settings`, label: "Configuración", show: hasOwnerAccess, icon: ShieldCheck },
    { href: `${dashboardRoot}/account`, label: "Mi cuenta", show: true, icon: User },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen md:flex">
      {/* `md:relative md:z-20`: necesario para que los tooltips del riel
          (.nav-label, position:absolute) pinten por ENCIMA del contenido
          de <main> — sin esto, al no tener <main> su propio z-index, el
          orden de pintado quedaría ambiguo y el tooltip terminaría tapado
          detrás de las tarjetas/tablas de cada página. El modal de detalle
          de cita (fixed, z-50) sigue por delante de todo igual, porque
          position:fixed no queda contenido por este z-index. */}
      <aside className="flex flex-col justify-between bg-case-deep text-paper md:relative md:z-20 md:w-20 md:shrink-0">
        <div>
          {/* Mobile: nombre del negocio + botón de logout (ícono) comparten
              una sola fila angosta — antes eran dos bloques apilados (nombre,
              luego un segundo bloque separado con el email completo y el
              texto "Cerrar sesión") que juntos ocupaban ~300px fijos arriba
              de cualquier pantalla, mucho en un viewport de ~800px de alto.
              El email ya se puede ver en "Mi cuenta" (nav), así que en
              mobile no hace falta repetirlo acá. Desde md: colapsa a una
              sola marca circular (el riel es angosto a propósito, no hay
              lugar para texto ahí) y el logout vuelve a su lugar de siempre
              más abajo, con el email visible como nav-label. */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:flex-col md:px-0 md:pb-3 md:pt-5">
            <p className="min-w-0 truncate font-display text-base font-semibold leading-tight md:hidden">
              {tenant.name}
            </p>
            <div
              className="hidden md:flex md:h-8 md:w-8 md:items-center md:justify-center md:rounded-full md:bg-gradient-to-br md:from-pine-light md:to-pine-dark md:font-display md:text-xs md:font-bold md:text-case-deep"
              title={`${tenant.name} · RIME`}
            >
              R
            </div>
            <form action={logoutAction} className="shrink-0 md:hidden">
              <SubmitButton
                icon={<LogOut className="h-4 w-4" />}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-paper/70 active:scale-95"
                aria-label="Cerrar sesión"
              >
                <span className="sr-only">Cerrar sesión</span>
              </SubmitButton>
            </form>
          </div>
          {!isLocked && (
            <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:items-center md:gap-1 md:overflow-visible md:px-2 md:py-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  exact={item.href === dashboardRoot}
                  className="nav-link group"
                  activeClassName="nav-link-active"
                >
                  <span className="nav-icon-badge">
                    <item.icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <div className="hidden border-t border-white/10 px-5 py-4 md:flex md:justify-center md:px-0 md:py-4">
          <form action={logoutAction}>
            <SubmitButton
              icon={<LogOut className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:scale-110" />}
              pendingLabel="Cerrando sesión…"
              className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-xs text-paper/70 transition-colors hover:border-berry/50 hover:bg-berry/20"
            >
              <span className="nav-label hidden md:block">{session.user.email} · Cerrar sesión</span>
            </SubmitButton>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-10 md:px-12 md:py-12">{children}</main>
    </div>
  );
}
