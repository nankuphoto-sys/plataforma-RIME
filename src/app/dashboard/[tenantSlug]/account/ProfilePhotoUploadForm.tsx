"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  ALLOWED_PROFILE_IMAGE_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_PROFILE_IMAGE_LABEL,
} from "@/lib/profileImage";
import { updateProfilePhotoAction } from "./actions";

interface ProfilePhotoUploadFormProps {
  tenantSlug: string;
}

// Valida tamaño y formato del lado del cliente ANTES de que el archivo
// llegue a intentar subirse — así un archivo pesado nunca choca contra el
// límite de la Server Action (bodySizeLimit en next.config.mjs). Sin esto,
// un archivo más grande que ese límite tira la pantalla de error de Next.js
// ("Failed to fetch") en vez de un aviso prolijo. La validación del servidor
// en account/actions.ts queda igual, como respaldo (por si el archivo se
// fuerza a subir con JS deshabilitado).
export function ProfilePhotoUploadForm({ tenantSlug }: ProfilePhotoUploadFormProps) {
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setClientError(null);
      setFileName(null);
      return;
    }

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      setClientError("Formato no soportado. Usa JPG, PNG o WEBP.");
      event.target.value = "";
      setFileName(null);
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setClientError(
        `Esa imagen pesa ${sizeMb}MB. El máximo es ${MAX_PROFILE_IMAGE_LABEL} — elige una más liviana.`
      );
      event.target.value = "";
      setFileName(null);
      return;
    }

    setClientError(null);
    setFileName(file.name);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Defensa extra: si quedó un error vigente o no hay archivo elegido, no
    // dejamos que el submit llegue a la Server Action.
    if (clientError || !inputRef.current?.files?.length) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        action={updateProfilePhotoAction.bind(null, tenantSlug)}
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          ref={inputRef}
          type="file"
          name="profileImage"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={handleFileChange}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-md bg-sage px-3 py-1.5 text-xs font-medium text-ink hover:bg-sage-dark/40"
        >
          Elegir archivo
        </button>
        <span className="truncate text-sm text-ink/70">
          {fileName ?? "Sin archivo seleccionado"}
        </span>
        <SubmitButton
          icon={<Upload className="h-3.5 w-3.5" />}
          pendingLabel="Guardando…"
          disabled={Boolean(clientError)}
          className="btn-secondary-sm"
        >
          Guardar
        </SubmitButton>
      </form>
      {clientError && <p className="msg-error text-xs">{clientError}</p>}
    </div>
  );
}
