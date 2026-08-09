"use client";

import { useState } from "react";

type Policy = "NONE" | "DEPOSIT" | "FULL_PAYMENT";
type Type = "PERCENTAGE" | "FIXED";

const POLICIES: { value: Policy; label: string; description: string }[] = [
  {
    value: "NONE",
    label: "Sin pago anticipado",
    description: "El cliente reserva sin pagar; vos confirmás la cita manualmente.",
  },
  {
    value: "DEPOSIT",
    label: "Seña",
    description: "Cobra una parte del servicio al reservar; el resto se paga en el local.",
  },
  {
    value: "FULL_PAYMENT",
    label: "Pago completo",
    description: "Cobra el 100% del servicio al reservar.",
  },
];

// Único pedazo interactivo del formulario de política de pago: qué inputs de
// seña mostrar depende de la opción elegida. El resto de la página
// (título, banners, botón de guardar) sigue siendo Server Component.
export function DepositPolicyFields({
  defaultPolicy,
  defaultType,
  defaultValue,
}: {
  defaultPolicy: Policy;
  defaultType: Type | null;
  defaultValue: string | null;
}) {
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [type, setType] = useState<Type>(defaultType ?? "PERCENTAGE");

  return (
    <div className="space-y-3">
      {POLICIES.map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
            policy === option.value ? "border-pine bg-pine-light/40" : "border-sage-dark/40 hover:border-sage-dark"
          }`}
        >
          <input
            type="radio"
            name="depositPolicy"
            value={option.value}
            checked={policy === option.value}
            onChange={() => setPolicy(option.value)}
            className="field-checkbox mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            <span className="block text-xs text-ink/50">{option.description}</span>
          </span>
        </label>
      ))}

      {policy === "DEPOSIT" && (
        <div className="ml-1 flex flex-wrap items-end gap-3 rounded-lg bg-sage/40 px-4 py-3">
          <div>
            <label className="field-label" htmlFor="depositType">
              Tipo
            </label>
            <select
              id="depositType"
              name="depositType"
              value={type}
              onChange={(e) => setType(e.target.value as Type)}
              className="field-input"
            >
              <option value="PERCENTAGE">Porcentaje</option>
              <option value="FIXED">Monto fijo</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="depositValue">
              {type === "PERCENTAGE" ? "Porcentaje del servicio" : "Monto fijo"}
            </label>
            <input
              id="depositValue"
              name="depositValue"
              type="number"
              min={type === "PERCENTAGE" ? 1 : 0.01}
              max={type === "PERCENTAGE" ? 100 : undefined}
              step="0.01"
              defaultValue={defaultValue ?? ""}
              required
              className="field-input"
            />
          </div>
        </div>
      )}
    </div>
  );
}
