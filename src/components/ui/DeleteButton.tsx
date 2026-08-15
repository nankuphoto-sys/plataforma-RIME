"use client";

import { Trash2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SubmitButton } from "./SubmitButton";

interface DeleteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  confirmMessage: string;
  children: ReactNode;
  pendingLabel?: string;
}

// Botón de submit para acciones destructivas dentro de <form action={...}>:
// pide confirmación con window.confirm antes de dejar pasar el submit. No
// existía ningún patrón de confirmación en el proyecto — todo lo demás usa
// `active` para desactivar en vez de borrar (ver deleteInventoryItemAction/
// deleteInventoryMovementAction para el razonamiento de cuándo sí se borra).
// Estilo .btn-danger por default — definido en globals.css pero sin usar
// hasta ahora.
export function DeleteButton({
  confirmMessage,
  children,
  pendingLabel,
  className,
  onClick,
  ...rest
}: DeleteButtonProps) {
  return (
    <SubmitButton
      icon={<Trash2 className="h-4 w-4" />}
      pendingLabel={pendingLabel ?? "Borrando…"}
      className={className ?? "btn-danger"}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </SubmitButton>
  );
}
