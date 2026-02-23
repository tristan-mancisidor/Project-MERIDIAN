-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('NONE', 'FLAGGED', 'ESCALATED');

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "user_id" TEXT,
    "original_query" TEXT NOT NULL,
    "classified_intents" JSONB NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "participating_agents" TEXT[],
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "confidence_score" DECIMAL(3,2),
    "escalation_level" "EscalationLevel" NOT NULL DEFAULT 'NONE',
    "final_response" TEXT,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_handoffs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "from_agent" TEXT,
    "to_agent" TEXT NOT NULL,
    "handoff_depth" INTEGER NOT NULL DEFAULT 0,
    "status" "HandoffStatus" NOT NULL DEFAULT 'PENDING',
    "input_context" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "confidence_score" DECIMAL(3,2),
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "interaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sessions_client_id_idx" ON "agent_sessions"("client_id");

-- CreateIndex
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions"("status");

-- CreateIndex
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions"("created_at");

-- CreateIndex
CREATE INDEX "agent_handoffs_session_id_idx" ON "agent_handoffs"("session_id");

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
