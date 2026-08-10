"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface CopyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  value: string;
  children: ReactNode;
}

// Mismo shape de props que SubmitButton.tsx, sin useFormStatus porque no es
// un form action — copia `value` al portapapeles y muestra "¡Copiado!" por
// un momento antes de volver a la etiqueta original.
export function CopyButton({ value, children, className, ...rest }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={handleClick} className={className ?? "btn-secondary-sm"} {...rest}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "¡Copiado!" : children}
    </button>
  );
}
