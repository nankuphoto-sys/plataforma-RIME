import Link from "next/link";
import { AlignLeft, Calendar, Hash, List, ListPlus, ToggleLeft, Type as TypeIcon } from "lucide-react";
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

const TYPE_ICONS: Record<string, typeof TypeIcon> = {
  TEXT: TypeIcon,
  TEXTAREA: AlignLeft,
  NUMBER: Hash,
  DATE: Calendar,
  SELECT: List,
  BOOLEAN: ToggleLeft,
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
    <div className="mx-auto max-w-6xl">
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

      {fields.length === 0 ? (
        <div className="empty-row mt-6 rounded-xl border border-dashed border-sage-dark/40">
          Este negocio todavía no tiene campos personalizados.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => {
            const FieldIcon = TYPE_ICONS[field.type] ?? TypeIcon;
            return (
              <Link
                key={field.id}
                href={`/dashboard/${tenantSlug}/client-fields/${field.id}`}
                className="panel group flex flex-col gap-4 hover:-translate-y-0.5 hover:border-pine/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
                      aria-hidden
                    >
                      <FieldIcon className="h-4 w-4" />
                    </span>
                    <p className="truncate font-medium text-ink group-hover:text-pine">{field.label}</p>
                  </div>
                  {field.active ? (
                    <span className="badge badge-pine flex-none">Activo</span>
                  ) : (
                    <span className="badge badge-sage flex-none">Inactivo</span>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-sage-dark/25 pt-3 text-xs">
                  <span className="text-ink/50">{TYPE_LABELS[field.type] ?? field.type}</span>
                  <span className="data-mono text-ink/40">{field.key}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
