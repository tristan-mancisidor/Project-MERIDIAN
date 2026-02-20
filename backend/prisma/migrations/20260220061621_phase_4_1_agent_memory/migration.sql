-- CreateEnum
CREATE TYPE "InteractionTrigger" AS ENUM ('USER_CHAT', 'SCHEDULED', 'EVENT', 'AGENT_CHAIN');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('CONVERSATION_SUMMARY', 'PREFERENCE', 'LIFE_EVENT', 'RECOMMENDATION', 'DECISION', 'RELATIONSHIP_NOTE');

-- CreateEnum
CREATE TYPE "MemoryImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "ai_interactions" ADD COLUMN     "agent_task_id" TEXT,
ADD COLUMN     "memory_extracted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trigger_type" "InteractionTrigger" NOT NULL DEFAULT 'USER_CHAT';

-- CreateTable
CREATE TABLE "agent_memories" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "agent_type" TEXT NOT NULL,
    "memory_type" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "structured_data" JSONB,
    "importance" "MemoryImportance" NOT NULL DEFAULT 'MEDIUM',
    "expires_at" TIMESTAMP(3),
    "source_interaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_memories_client_id_agent_type_idx" ON "agent_memories"("client_id", "agent_type");

-- CreateIndex
CREATE INDEX "agent_memories_client_id_memory_type_idx" ON "agent_memories"("client_id", "memory_type");

-- CreateIndex
CREATE INDEX "agent_memories_importance_idx" ON "agent_memories"("importance");

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
