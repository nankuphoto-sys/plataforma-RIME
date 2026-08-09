// Fuente única de verdad para las reglas de las fotos de seguimiento de un
// cliente (línea de tiempo de fotos) — mismo patrón que
// src/lib/profileImage.ts. A diferencia de la foto de perfil (una sola,
// guardada como data URI en User.image porque es chica y única), acá puede
// haber muchas fotos por cliente a lo largo del tiempo — por eso este
// módulo SÍ usa un servicio de almacenamiento real (Vercel Blob, ver
// clientPhotos actions) en vez del stopgap base64-en-Postgres, tal como ya
// advertía el propio comentario de profileImage.ts para este caso.
export const MAX_CLIENT_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_CLIENT_PHOTO_LABEL = "5MB";
export const ALLOWED_CLIENT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
