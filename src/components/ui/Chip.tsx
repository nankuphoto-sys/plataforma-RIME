"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Un solo componente para los 4 usos de "pill" que ya existían como clases
// sueltas duplicadas inline en BookingWizard.tsx: el breadcrumb de progreso
// (pending/done, no clickeable) y los selectores de fecha/hora/franja
// horaria (option/selected, clickeables). Sin onClick renderiza <span>
// (breadcrumb); con onClick renderiza <button> — mismas clases de
// globals.css de siempre (.booking-crumb*, .booking-option-compact,
// .booking-option-selected), solo se centraliza dónde se aplican.
type ChipVariant = "pending" | "done" | "option" | "selected";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className"> {
  variant: ChipVariant;
  mono?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ChipVariant, string> = {
  pending: "booking-crumb booking-crumb-pending",
  done: "booking-crumb booking-crumb-done",
  option: "booking-option-compact",
  selected: "booking-option-compact booking-option-selected",
};

export function Chip({ variant, mono, onClick, className, children, ...rest }: ChipProps) {
  const classes = [VARIANT_CLASS[variant], mono && "data-mono", className].filter(Boolean).join(" ");

  if (!onClick) {
    return <span className={classes}>{children}</span>;
  }

  return (
    <button type="button" onClick={onClick} className={classes} {...rest}>
      {children}
    </button>
  );
}
