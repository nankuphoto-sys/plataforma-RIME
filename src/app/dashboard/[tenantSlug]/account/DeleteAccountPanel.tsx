"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { tenantNameConfirmsDeletion } from "@/lib/accountDeletion";
import { cancelAccountDeletionAction, requestAccountDeletionAction } from "./actions";

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

interface DeleteAccountPanelProps {
  tenantSlug: string;
  tenantName: string;
  // ISO string (o null) en vez de Date: viene de un Server Component, y
  // Date no es serializable tal cual como prop de un componente cliente.
  deletionRequestedAt: string | null;
}

// El nombre coincide/no coincide se recalcula acá SOLO para dar feedback
// inmediato (habilitar el botón) — la validación real y autoritativa vive en
// requestAccountDeletionAction, que vuelve a comparar contra el nombre real
// del tenant en la base. Nunca confiar en este chequeo del cliente solo.
export function DeleteAccountPanel({ tenantSlug, tenantName, deletionRequestedAt }: DeleteAccountPanelProps) {
  const [requestedAt, setRequestedAt] = useState(deletionRequestedAt);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameMatches = tenantNameConfirmsDeletion(confirmName, tenantName);

  function handleRequestDeletion(event: React.FormEvent) {
    event.preventDefault();
    if (!nameMatches || isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await requestAccountDeletionAction(tenantSlug, confirmName);
      if (result.ok) {
        setRequestedAt(new Date().toISOString());
        setConfirmName("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleCancelDeletion() {
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await cancelAccountDeletionAction(tenantSlug);
      if (result.ok) {
        setRequestedAt(null);
      } else {
        setError(result.error);
      }
    });
  }

  if (requestedAt) {
    const requestedDate = new Date(requestedAt);
    const deletionDate = new Date(requestedDate.getTime() + GRACE_PERIOD_MS);

    return (
      <div className="panel mt-4 border-berry/30">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-berry/10 text-berry-dark"
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="section-title text-sm">Eliminación de cuenta solicitada</p>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          Solicitaste eliminar tu cuenta el {requestedDate.toLocaleDateString("es-CO")}. El borrado
          definitivo de todo tu historial (clientes, citas, pagos, inventario y todo lo demás)
          ocurrirá el <strong className="text-ink">{deletionDate.toLocaleDateString("es-CO")}</strong> si
          no cancelas antes.
        </p>

        {error && <p className="msg-error mt-3">{error}</p>}

        <button type="button" onClick={handleCancelDeletion} disabled={isPending} className="btn-secondary mt-4">
          {isPending ? "Cancelando…" : "Cancelar eliminación"}
        </button>
      </div>
    );
  }

  return (
    <div className="panel mt-4 border-berry/30">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-berry/10 text-berry-dark"
          aria-hidden
        >
          <Trash2 className="h-4 w-4" />
        </span>
        <p className="section-title text-sm">Eliminar cuenta</p>
      </div>
      <p className="mt-3 text-sm text-ink/60">
        Esto elimina para siempre todo el historial de tu negocio: clientes, fichas, citas, pagos,
        inventario, paquetes, gift cards y reseñas. Tienes 30 días desde que lo solicites para
        arrepentirte antes de que el borrado sea definitivo.
      </p>

      <form onSubmit={handleRequestDeletion} className="mt-4 space-y-3">
        <div>
          <label htmlFor="confirmName" className="field-label">
            Escribe <span className="font-semibold text-ink">{tenantName}</span> para confirmar
          </label>
          <input
            id="confirmName"
            type="text"
            required
            autoComplete="off"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className="field-input"
          />
        </div>

        {error && <p className="msg-error">{error}</p>}

        <button type="submit" disabled={!nameMatches || isPending} className="btn-danger">
          <Trash2 className="h-4 w-4" />
          {isPending ? "Eliminando…" : "Eliminar cuenta"}
        </button>
      </form>
    </div>
  );
}
