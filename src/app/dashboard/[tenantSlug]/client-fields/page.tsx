import Link from "next/link";
import { ListPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClientFieldsManageAccess } from "@/lib/auth-guards";

const TYPE_LABELS: Record<string, string> = {
  TEXT: "Texto",
  TEXTAREA: "Texto largo",
  NUMBER: "Número",
  DATE: "Fecha",
  SELECT: "Lista de opciones",
  BOOLEAN: "Sí/No",
};

export default async function ClientFieldsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireClientFieldsManageAccess(tenantSlug);

  const fields = await prisma.tenantClientField.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Campos de ficha</h1>
        <Link href={`/dashboard/${tenantSlug}/client-fields/new`} className="btn-primary">
          <ListPlus className="h-4 w-4" />
          Nuevo campo
        </Link>
      </div>
      <p className="page-subtitle">
        Campos adicionales para la ficha de cliente, sumados a los fijos de tu rubro (esos no se pueden
        editar desde acá).
      </p>

      <div className="table-shell mt-6">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="table-head-cell">Nombre</th>
              <th className="table-head-cell">Estado</th>
              <th className="table-head-cell">Tipo</th>
              <th className="table-head-cell">Clave</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.id} className="table-row">
                <td className="table-cell">
                  <Link
                    href={`/dashboard/${tenantSlug}/client-fields/${field.id}`}
                    className="font-medium text-ink hover:text-pine hover:underline"
                  >
                    {field.label}
                  </Link>
                </td>
                <td className="table-cell">
                  {field.active ? (
                    <span className="badge badge-pine">Activo</span>
                  ) : (
                    <span className="badge badge-sage">Inactivo</span>
                  )}
                </td>
                <td className="table-cell-muted">{TYPE_LABELS[field.type] ?? field.type}</td>
                <td className="table-cell-muted data-mono">{field.key}</td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Este negocio todavía no tiene campos personalizados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
