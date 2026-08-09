import { prisma } from "@/lib/prisma";

// Devuelve el id del Professional vinculado a este usuario (ver
// Professional.userId, único) o null si no tiene ninguno vinculado.
// Se usa para resolver la vista "solo lo mío" de un login con rol
// PROFESSIONAL en la agenda interna y en la ficha de clientes.
//
// Deliberadamente NO se cachea en la sesión JWT (a diferencia de
// locationRoles): vincular/desvincular un profesional (ver
// professionals/actions.ts) es una operación poco frecuente y agregar esto
// al token sumaría otro caso de "hay que re-loguearse para ver el cambio",
// igual al que ya existe hoy para locationRoles.
export async function getLinkedProfessionalId(userId: string): Promise<string | null> {
  const professional = await prisma.professional.findUnique({
    where: { userId },
    select: { id: true },
  });
  return professional?.id ?? null;
}
