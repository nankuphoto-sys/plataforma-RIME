import { describe, expect, it } from "vitest";
import { buildSegmentWhereClause } from "./marketing";

describe("buildSegmentWhereClause", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  it("ALL_CLIENTS excluye clientes sin email y dados de baja, sin filtrar por citas", () => {
    const where = buildSegmentWhereClause("ALL_CLIENTS", "tenant-1", now);
    expect(where).toEqual({
      tenantId: "tenant-1",
      email: { not: null },
      marketingOptOut: false,
    });
  });

  it("INACTIVE_60_DAYS también excluye sin email y dados de baja", () => {
    const where = buildSegmentWhereClause("INACTIVE_60_DAYS", "tenant-1", now);
    expect(where).toMatchObject({
      tenantId: "tenant-1",
      email: { not: null },
      marketingOptOut: false,
    });
  });

  it("INACTIVE_60_DAYS exige al menos una cita completada", () => {
    const where = buildSegmentWhereClause("INACTIVE_60_DAYS", "tenant-1", now);
    expect(where.appointments).toMatchObject({ some: { status: "COMPLETED" } });
  });

  it("INACTIVE_60_DAYS usa un corte de 60 días antes de `now`", () => {
    const where = buildSegmentWhereClause("INACTIVE_60_DAYS", "tenant-1", now);
    const noneOr = (where.appointments as { none: { OR: { startsAt?: { gt: Date } }[] } }).none.OR;
    const completedCutoff = noneOr.find((c) => "startsAt" in c)?.startsAt?.gt;
    expect(completedCutoff).toEqual(new Date("2026-06-11T00:00:00.000Z"));
  });
});
