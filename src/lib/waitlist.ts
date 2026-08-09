export interface WaitlistCandidate {
  id: string;
  locationId: string;
  serviceId: string;
  professionalId: string | null;
  preferredFrom: Date | null;
  preferredTo: Date | null;
  createdAt: Date;
}

export interface FreedSlot {
  locationId: string;
  serviceId: string;
  professionalId: string;
  startsAt: Date;
}

// Cuando una cita se cancela, decide a cuál de los candidatos en espera (ya
// filtrados por quien llama a que tengan un teléfono válido — no tiene
// sentido "matchear" a alguien que no se le puede avisar) ofrecerle el cupo
// liberado. "Inteligente" en el sentido de nunca bombardear a todos los que
// esperan ese servicio: solo al que matchea Y espera hace más tiempo. Pura,
// sin acceso a base de datos — misma forma que isClientInactive/
// isPackageNearingExpiration.
export function findBestWaitlistMatch(
  candidates: WaitlistCandidate[],
  freedSlot: FreedSlot
): WaitlistCandidate | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.locationId === freedSlot.locationId &&
      candidate.serviceId === freedSlot.serviceId &&
      (candidate.professionalId === null || candidate.professionalId === freedSlot.professionalId) &&
      (!candidate.preferredFrom || freedSlot.startsAt >= candidate.preferredFrom) &&
      (!candidate.preferredTo || freedSlot.startsAt <= candidate.preferredTo)
  );

  if (matches.length === 0) return null;

  return matches.reduce((oldest, candidate) =>
    candidate.createdAt.getTime() < oldest.createdAt.getTime() ? candidate : oldest
  );
}
