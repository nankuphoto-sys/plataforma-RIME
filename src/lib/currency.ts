// Moneda del negocio: pesos colombianos (COP). Sin decimales — en uso real
// nadie cobra centavos de peso, y así evita el ruido de ".00" en toda la UI.
export function formatCOP(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

// Mismo valor pero sin el símbolo de moneda — para tablas/PDF donde la
// columna ya dice "COP" en el encabezado y repetirlo en cada fila es ruido.
export function formatCOPNumber(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}
