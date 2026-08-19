"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILE_LABEL, type ColumnMapping } from "@/lib/clientImport";
import { confirmImportAction, parseCsvPreviewAction } from "./actions";

interface ImportWizardProps {
  tenantSlug: string;
}

type PreviewState = {
  fileName: string;
  fileContent: string;
  headers: string[];
  mapping: ColumnMapping;
  previewRows: string[][];
  totalRows: number;
};

type ResultState = { created: number; skipped: number; errors: string[] };

// No mapear una columna se representa como "" en el <select> (no como
// null) — así el value del <select> siempre es un string, requisito de
// React para inputs controlados.
function mappingValueToSelect(value: string | null): string {
  return value ?? "";
}

// Wizard de 3 pasos, todo en un solo componente cliente porque el estado
// (archivo leído, mapeo editado a mano, resultado) tiene que sobrevivir
// entre pasos sin ida y vuelta al server hasta que el usuario confirma —
// mismo patrón de useState + useTransition que AskCopilotBox.tsx (Server
// Actions que devuelven { ok, ... } en vez de usar <form action> con
// redirect, porque acá no hay a dónde redirigir entre pasos).
export function ImportWizard({ tenantSlug }: ImportWizardProps) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: null, email: null, phone: null });
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Elige un archivo .csv — el soporte de Excel es a través de un CSV exportado desde Excel (Archivo → Guardar como → CSV).");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setError(`Ese archivo pesa ${sizeMb}MB. El máximo es ${MAX_IMPORT_FILE_LABEL} — divídelo en archivos más chicos.`);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const fileContent = typeof reader.result === "string" ? reader.result : "";
      startTransition(async () => {
        const response = await parseCsvPreviewAction(tenantSlug, fileContent);
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setPreview({
          fileName: file.name,
          fileContent,
          headers: response.headers,
          mapping: response.mapping,
          previewRows: response.previewRows,
          totalRows: response.totalRows,
        });
        setMapping(response.mapping);
        setStep("preview");
      });
    };
    reader.onerror = () => setError("No se pudo leer el archivo — inténtalo de nuevo.");
    reader.readAsText(file, "utf-8");
  }

  function handleConfirm() {
    if (!preview || !mapping.name) return;
    setError(null);

    startTransition(async () => {
      const response = await confirmImportAction(tenantSlug, preview.fileContent, {
        name: mapping.name ?? "",
        email: mapping.email ?? "",
        phone: mapping.phone ?? "",
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult({ created: response.created, skipped: response.skipped, errors: response.errors });
      setStep("result");
    });
  }

  function reset() {
    setStep("upload");
    setPreview(null);
    setMapping({ name: null, email: null, phone: null });
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <p className="msg-error">{error}</p>}

      {step === "upload" && (
        <div className="panel flex flex-col items-center gap-3 border-dashed py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage text-ink/45">
            <UploadCloud className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Elige un archivo CSV con tus clientes</p>
            <p className="mt-1 text-xs text-ink/45">
              Debe tener una fila de encabezados (Nombre, Email, Teléfono...). Máximo {MAX_IMPORT_FILE_LABEL}.
            </p>
          </div>
          <label className="btn-primary cursor-pointer">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {isPending ? "Leyendo archivo…" : "Elegir archivo .csv"}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={isPending}
              className="hidden"
            />
          </label>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="panel">
            <p className="section-title text-sm">Archivo: {preview.fileName}</p>
            <p className="mt-1 text-xs text-ink/45">
              {preview.totalRows} fila{preview.totalRows === 1 ? "" : "s"} de datos detectada
              {preview.totalRows === 1 ? "" : "s"}. Revisa el mapeo de columnas — se detectó automáticamente, pero
              puedes corregirlo antes de importar.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MappingSelect
                label="Nombre *"
                headers={preview.headers}
                value={mappingValueToSelect(mapping.name)}
                onChange={(value) => setMapping((m) => ({ ...m, name: value || null }))}
                required
              />
              <MappingSelect
                label="Email"
                headers={preview.headers}
                value={mappingValueToSelect(mapping.email)}
                onChange={(value) => setMapping((m) => ({ ...m, email: value || null }))}
              />
              <MappingSelect
                label="Teléfono"
                headers={preview.headers}
                value={mappingValueToSelect(mapping.phone)}
                onChange={(value) => setMapping((m) => ({ ...m, phone: value || null }))}
              />
            </div>
          </div>

          <div>
            <p className="field-label mb-2">
              Vista previa (primeras {preview.previewRows.length} filas)
            </p>
            <div className="table-shell">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} className="table-head-cell">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row, i) => (
                    <tr key={i} className="table-row">
                      {preview.headers.map((header, j) => (
                        <td key={header} className="table-cell-muted">
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || !mapping.name}
              className="btn-primary"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {isPending ? "Importando…" : `Confirmar e importar ${preview.totalRows} clientes`}
            </button>
            <button type="button" onClick={reset} disabled={isPending} className="btn-secondary">
              Elegir otro archivo
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="panel flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pine/15 text-pine-dark">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-ink">Importación terminada</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="badge badge-pine">{result.created} creados</span>
              <span className="badge badge-sage">{result.skipped} ya existían (se omitieron)</span>
              {result.errors.length > 0 && (
                <span className="badge badge-berry">{result.errors.length} filas con error</span>
              )}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="panel">
              <p className="section-title text-sm">Filas omitidas</p>
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-ink/60">
                {result.errors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link href={`/dashboard/${tenantSlug}/clients`} className="btn-primary">
              Ver clientes
            </Link>
            <button type="button" onClick={reset} className="btn-secondary">
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingSelect({
  label,
  headers,
  value,
  onChange,
  required,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field-input">
        <option value="">{required ? "Elige una columna" : "No usar"}</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );
}
