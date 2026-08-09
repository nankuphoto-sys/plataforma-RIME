"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  pendingLabel?: string;
  children: ReactNode;
}

// Botón de submit para <form action={serverAction}>: usa useFormStatus para
// mostrar feedback instantáneo (spinner + opacidad reducida) mientras la
// Server Action está en vuelo, sin tocar la Server Action en sí.
export function SubmitButton({
  icon,
  pendingLabel,
  children,
  className,
  disabled,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${className ?? "btn-primary"} ${pending ? "opacity-70" : ""}`}
      {...rest}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
