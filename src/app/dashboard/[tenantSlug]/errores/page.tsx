import { requireOwnerAccess } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

// Vista de solo lectura de ErrorLog para este tenant — visibilidad mínima
// para el OWNER de errores no capturados (error boundaries del App Router)
// y de fallas en los webhooks de pago (Stripe/Wompi), que hoy solo quedaban
// en console.error disperso. Mismo guard que Facturación/Configuración
// (requireOwnerAccess): esto puede exponer detalles técnicos internos
// (stack traces), no es algo para que vea cualquier STAFF.
//
// A propósito NO está enlazada en el nav del dashboard todavía (ver
// src/app/dashboard/[tenantSlug]/layout.tsx) — no había un lugar obvio y de
// bajo riesgo para agregarla sin coordinarlo, queda como ruta directa.
export default async function ErroresPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireOwnerAccess(tenantSlug);

  // ErrorLog.tenantId es nullable (algunos errores, ej. en global-error.tsx
  // sin contexto de tenant resuelto, o algo raro previo a resolver el
  // tenant en un webhook, se registran sin tenant) — esta vista solo
  // muestra los que sí pudieron asociarse a este negocio.
  const errorLogs = await prisma.errorLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="page-title">Errores</h1>
      <p className="mt-1 text-sm text-ink/60">
        Últimos {errorLogs.length} errores registrados para este negocio, más recientes primero.
      </p>

      {errorLogs.length === 0 ? (
        <p className="mt-6 text-sm text-ink/40">No hay errores registrados todavía.</p>
      ) : (
        <div className="table-shell mt-6">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="table-head-cell">Fecha</th>
                <th className="table-head-cell">Nivel</th>
                <th className="table-head-cell">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {errorLogs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="table-cell-muted data-mono whitespace-nowrap">
                    {log.createdAt.toLocaleString("es-CO", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.level === "error" ? "bg-berry/15 text-berry" : "bg-gold/15 text-gold"
                      }`}
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="table-cell-muted">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
