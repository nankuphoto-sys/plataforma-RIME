import { Save } from "lucide-react";
import type { ClientFieldDefinition } from "@/lib/clientFieldTemplates";
import { SubmitButton } from "@/components/ui/SubmitButton";

export interface ClientFormInitialValues {
  name?: string;
  email?: string;
  phone?: string;
  birthdate?: string; // yyyy-mm-dd, listo para <input type="date">
  customFields?: Record<string, unknown>;
}

interface ClientFormProps {
  fieldTemplate: ClientFieldDefinition[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  errorMessage?: string;
  initialValues?: ClientFormInitialValues;
}

export function ClientForm({
  fieldTemplate,
  action,
  submitLabel,
  submitIcon,
  errorMessage,
  initialValues,
}: ClientFormProps) {
  return (
    <form action={action} className="mt-6 space-y-4">
      {errorMessage && <p className="msg-error">{errorMessage}</p>}

      <div>
        <label className="field-label" htmlFor="name">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initialValues?.name ?? ""}
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={initialValues?.email ?? ""}
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="phone">
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initialValues?.phone ?? ""}
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="birthdate">
          Fecha de nacimiento
        </label>
        <input
          id="birthdate"
          name="birthdate"
          type="date"
          defaultValue={initialValues?.birthdate ?? ""}
          className="field-input"
        />
      </div>

      {fieldTemplate.length > 0 && (
        <div className="border-t border-sage-dark/30 pt-4">
          <p className="section-title text-sm">Ficha</p>
          <div className="mt-3 space-y-4">
            {fieldTemplate.map((field) => (
              <DynamicField
                key={field.key}
                field={field}
                value={initialValues?.customFields?.[field.key]}
              />
            ))}
          </div>
        </div>
      )}

      <SubmitButton icon={submitIcon ?? <Save className="h-4 w-4" />} pendingLabel="Guardando…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

function DynamicField({ field, value }: { field: ClientFieldDefinition; value: unknown }) {
  switch (field.type) {
    case "textarea":
      return (
        <div>
          <label className="field-label" htmlFor={field.key}>
            {field.label}
          </label>
          <textarea
            id={field.key}
            name={field.key}
            rows={3}
            defaultValue={typeof value === "string" ? value : ""}
            className="field-input"
          />
        </div>
      );
    case "select":
      return (
        <div>
          <label className="field-label" htmlFor={field.key}>
            {field.label}
          </label>
          <select
            id={field.key}
            name={field.key}
            defaultValue={typeof value === "string" ? value : ""}
            className="field-input"
          >
            <option value="">Selecciona una opción</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input
            id={field.key}
            name={field.key}
            type="checkbox"
            defaultChecked={value === true}
            className="field-checkbox"
          />
          <label className="text-sm font-medium text-ink/75" htmlFor={field.key}>
            {field.label}
          </label>
        </div>
      );
    case "number":
      return (
        <div>
          <label className="field-label" htmlFor={field.key}>
            {field.label}
          </label>
          <input
            id={field.key}
            name={field.key}
            type="number"
            defaultValue={typeof value === "number" ? value : ""}
            className="field-input"
          />
        </div>
      );
    case "date":
      return (
        <div>
          <label className="field-label" htmlFor={field.key}>
            {field.label}
          </label>
          <input
            id={field.key}
            name={field.key}
            type="date"
            defaultValue={typeof value === "string" ? value : ""}
            className="field-input"
          />
        </div>
      );
    case "text":
    default:
      return (
        <div>
          <label className="field-label" htmlFor={field.key}>
            {field.label}
          </label>
          <input
            id={field.key}
            name={field.key}
            type="text"
            defaultValue={typeof value === "string" ? value : ""}
            className="field-input"
          />
        </div>
      );
  }
}
