// Iniciales + tono de color determinístico para avatares de persona
// (clientes, profesionales, equipo) — sin foto real en el modelo de datos,
// esto es lo que reemplaza a una imagen de perfil en toda la app.

// Nunca berry/gold — esos colores ya significan "alerta"/"pendiente" en los
// badges de estado del dashboard, así que quedan reservados para eso.
const AVATAR_TONES = ["bg-pine", "bg-pine-dark", "bg-ink"] as const;

export function avatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
