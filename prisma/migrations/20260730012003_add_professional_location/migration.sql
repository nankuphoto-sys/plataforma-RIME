-- CreateTable
CREATE TABLE "ProfessionalLocation" (
    "professionalId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "ProfessionalLocation_pkey" PRIMARY KEY ("professionalId","locationId")
);

-- AddForeignKey
ALTER TABLE "ProfessionalLocation" ADD CONSTRAINT "ProfessionalLocation_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLocation" ADD CONSTRAINT "ProfessionalLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada profesional queda asignado a toda sede donde ya tenga
-- al menos una cita.
INSERT INTO "ProfessionalLocation" ("professionalId", "locationId")
SELECT DISTINCT a."professionalId", a."locationId"
FROM "Appointment" a
ON CONFLICT DO NOTHING;

-- Backfill: un profesional sin ninguna cita todavía queda asignado a la
-- sede más antigua de su tenant (si el tenant ya tiene alguna sede).
INSERT INTO "ProfessionalLocation" ("professionalId", "locationId")
SELECT p.id, (
  SELECT l.id FROM "Location" l
  WHERE l."tenantId" = p."tenantId"
  ORDER BY l."createdAt" ASC
  LIMIT 1
)
FROM "Professional" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProfessionalLocation" pl WHERE pl."professionalId" = p.id
)
AND EXISTS (
  SELECT 1 FROM "Location" l WHERE l."tenantId" = p."tenantId"
);
