-- CreateTable
CREATE TABLE "CopilotQuestionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotQuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotQuestionAttempt_userId_createdAt_idx" ON "CopilotQuestionAttempt"("userId", "createdAt");
