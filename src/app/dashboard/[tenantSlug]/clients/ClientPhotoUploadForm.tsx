"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ALLOWED_CLIENT_PHOTO_TYPES, MAX_CLIENT_PHOTO_BYTES, MAX_CLIENT_PHOTO_LABEL } from "@/lib/clientPhotos";
import { uploadClientPhotoAction } from "./actions";

interface ClientPhotoUploadFormProps {
  tenantSlug: string;
  clientId: string;
}

// Misma validación del lado del cliente ANTES de subir que
// account/ProfilePhotoUploadForm.tsx (mismo motivo: sin esto, un archivo
// más pesado que bodySizeLimit da "Failed to fetch" en vez de un aviso
// prolijo). La validación del servidor en clients/actions.ts queda igual,
// como respaldo.
export function ClientPhotoUploadForm({ tenantSlug, clientId }: ClientPhotoUploadFormProps) {
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setClientError(null);
      return;
    }

    if (!ALLOWED_CLIENT_PHOTO_TYPES.has(file.type)) {
      setClientError("Formato no soportado. Usá JPG, PNG o WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_CLIENT_PHOTO_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setClientError(`Esa foto pesa ${sizeMb}MB. El máximo es ${MAX_CLIENT_PHOTO_LABEL} — elegí una más liviana.`);
      event.target.value = "";
      return;
    }

    setClientError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (clientError || !inputRef.current?.files?.length) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        action={uploadClientPhotoAction.bind(null, tenantSlug, clientId)}
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={handleFileChange}
          className="text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-sage file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-sage-dark/40"
        />
        <input
          type="text"
          name="caption"
          placeholder="Nota (opcional)"
          className="field-input mt-0 w-40"
        />
        <SubmitButton
          icon={<Camera className="h-3.5 w-3.5" />}
          pendingLabel="Subiendo…"
          disabled={Boolean(clientError)}
        >
          Subir foto
        </SubmitButton>
      </form>
      {clientError && <p className="msg-error text-xs">{clientError}</p>}
    </div>
  );
}
