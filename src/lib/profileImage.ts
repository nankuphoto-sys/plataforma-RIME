// Fuente única de verdad para las reglas de la foto de perfil — importada
// tanto por el Server Action (account/actions.ts) como por el componente
// cliente que valida ANTES de enviar el archivo (account/ProfilePhotoUploadForm.tsx).
// Si el límite cambia algún día, cambia acá una sola vez.
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_PROFILE_IMAGE_LABEL = "5MB";
export const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
