import type { TenantVertical } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ClientFieldType = "text" | "textarea" | "number" | "date" | "select" | "boolean";

export interface ClientFieldDefinition {
  key: string; // clave dentro de Client.customFields
  label: string;
  type: ClientFieldType;
  options?: string[]; // solo para type "select"
}

// Plantillas fijas en código por vertical — a propósito, para mantener el
// alcance acotado. NO es un constructor de formularios editable por el
// usuario; eso queda fuera de esta fase.
export const CLIENT_FIELD_TEMPLATES: Record<TenantVertical, ClientFieldDefinition[]> = {
  GENERAL: [{ key: "notas", label: "Notas generales", type: "textarea" }],
  PSICOLOGIA: [
    { key: "motivoConsulta", label: "Motivo de consulta", type: "textarea" },
    { key: "diagnosticoCie10", label: "Diagnóstico (CIE-10)", type: "text" },
    { key: "medicacionActual", label: "Medicación actual", type: "textarea" },
    { key: "antecedentes", label: "Antecedentes relevantes", type: "textarea" },
  ],
  NUTRICION: [
    { key: "pesoActualKg", label: "Peso actual (kg)", type: "number" },
    { key: "alturaCm", label: "Altura (cm)", type: "number" },
    {
      key: "objetivo",
      label: "Objetivo",
      type: "select",
      options: ["Bajar de peso", "Subir masa muscular", "Mantener", "Salud general"],
    },
    { key: "alergiasAlimentarias", label: "Alergias alimentarias", type: "textarea" },
  ],
  FISIOTERAPIA: [
    { key: "zonaAfectada", label: "Zona afectada", type: "text" },
    { key: "diagnostico", label: "Diagnóstico", type: "text" },
    { key: "rangoMovilidad", label: "Rango de movilidad", type: "text" },
    { key: "dolorEscala", label: "Dolor (escala 1-10)", type: "number" },
  ],
  ESTETICA: [
    {
      key: "tipoPiel",
      label: "Tipo de piel",
      type: "select",
      options: ["Seca", "Grasa", "Mixta", "Sensible", "Normal"],
    },
    { key: "tratamientosPrevios", label: "Tratamientos previos", type: "textarea" },
    { key: "alergias", label: "Alergias", type: "textarea" },
  ],
};

export function getClientFieldTemplate(vertical: TenantVertical): ClientFieldDefinition[] {
  return CLIENT_FIELD_TEMPLATES[vertical];
}

// Plantilla fija de la vertical + campos personalizados activos del tenant
// (TenantClientField), siempre en ese orden — los personalizados nunca
// reemplazan ni reordenan los fijos, solo se agregan al final.
export async function getEffectiveClientFieldTemplate(
  tenantId: string,
  vertical: TenantVertical
): Promise<ClientFieldDefinition[]> {
  const fixed = getClientFieldTemplate(vertical);
  const custom = await prisma.tenantClientField.findMany({
    where: { tenantId, active: true },
    orderBy: { order: "asc" },
  });
  const mapped: ClientFieldDefinition[] = custom.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type.toLowerCase() as ClientFieldType,
    options: Array.isArray(field.options) ? (field.options as string[]) : undefined,
  }));
  return [...fixed, ...mapped];
}
