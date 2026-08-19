// Confirmación de "Eliminar cuenta" (ver requestAccountDeletionAction en
// src/app/dashboard/[tenantSlug]/account/actions.ts): el usuario tiene que
// escribir el nombre EXACTO de su negocio para confirmar. Comparación
// case-sensitive y sin trim — a propósito: aceptar "Mi Negocio " con un
// espacio de más como si fuera "Mi Negocio" debilita la fricción intencional
// de este paso (es la única barrera antes de un borrado real del historial
// completo del negocio). Un solo helper compartido entre el Server Action
// (autoritativo) y el formulario cliente (solo para habilitar el botón
// antes de tiempo, feedback inmediato) para que ambos lados nunca diverjan.
export function tenantNameConfirmsDeletion(confirmName: string, tenantName: string): boolean {
  return confirmName === tenantName;
}
