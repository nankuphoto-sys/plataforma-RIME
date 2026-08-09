import { describe, expect, it } from "vitest";
import { findBestWaitlistMatch, type WaitlistCandidate } from "./waitlist";

const DAY = 24 * 60 * 60 * 1000;

function candidate(overrides: Partial<WaitlistCandidate> = {}): WaitlistCandidate {
  return {
    id: "wl_1",
    locationId: "loc_1",
    serviceId: "svc_1",
    professionalId: null,
    preferredFrom: null,
    preferredTo: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

const freedSlot = {
  locationId: "loc_1",
  serviceId: "svc_1",
  professionalId: "pro_1",
  startsAt: new Date("2026-08-10T00:00:00.000Z"),
};

describe("findBestWaitlistMatch", () => {
  it("devuelve null sin candidatos", () => {
    expect(findBestWaitlistMatch([], freedSlot)).toBeNull();
  });

  it("no matchea una sede distinta", () => {
    expect(findBestWaitlistMatch([candidate({ locationId: "otra-sede" })], freedSlot)).toBeNull();
  });

  it("no matchea un servicio distinto", () => {
    expect(findBestWaitlistMatch([candidate({ serviceId: "otro-servicio" })], freedSlot)).toBeNull();
  });

  it("matchea con professionalId null (cualquier profesional)", () => {
    const c = candidate({ professionalId: null });
    expect(findBestWaitlistMatch([c], freedSlot)).toBe(c);
  });

  it("matchea si professionalId coincide con el de la cita liberada", () => {
    const c = candidate({ professionalId: "pro_1" });
    expect(findBestWaitlistMatch([c], freedSlot)).toBe(c);
  });

  it("no matchea si professionalId pide OTRO profesional puntual", () => {
    expect(findBestWaitlistMatch([candidate({ professionalId: "pro_2" })], freedSlot)).toBeNull();
  });

  it("respeta la ventana preferredFrom/preferredTo", () => {
    const dentro = candidate({
      preferredFrom: new Date(freedSlot.startsAt.getTime() - DAY),
      preferredTo: new Date(freedSlot.startsAt.getTime() + DAY),
    });
    const fuera = candidate({
      preferredFrom: new Date(freedSlot.startsAt.getTime() + 5 * DAY),
    });
    expect(findBestWaitlistMatch([dentro], freedSlot)).toBe(dentro);
    expect(findBestWaitlistMatch([fuera], freedSlot)).toBeNull();
  });

  it("entre varios candidatos que matchean, elige al que espera hace más tiempo", () => {
    const masReciente = candidate({ id: "wl_reciente", createdAt: new Date("2026-08-05T00:00:00.000Z") });
    const masAntiguo = candidate({ id: "wl_antiguo", createdAt: new Date("2026-07-20T00:00:00.000Z") });
    expect(findBestWaitlistMatch([masReciente, masAntiguo], freedSlot)).toBe(masAntiguo);
  });
});
