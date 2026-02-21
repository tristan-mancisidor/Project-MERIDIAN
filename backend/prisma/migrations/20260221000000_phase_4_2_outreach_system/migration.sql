-- Phase 4.2: Proactive Client Outreach System
-- Adds OutreachRule, OutreachTrigger, and OutreachMessage models

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('PORTFOLIO_DRIFT', 'MARKET_EVENT', 'LIFE_EVENT', 'ACCOUNT_MILESTONE', 'REVIEW_DUE', 'GOAL_OFF_TRACK');

-- CreateEnum
CREATE TYPE "TriggerStatus" AS ENUM ('DETECTED', 'PROCESSING', 'MESSAGE_DRAFTED', 'COMPLETED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'PORTAL', 'SMS');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OutreachPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "outreach_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" "TriggerType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "agent_type" TEXT NOT NULL,
    "priority" "OutreachPriority" NOT NULL DEFAULT 'MEDIUM',
    "cooldown_days" INTEGER NOT NULL DEFAULT 30,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_triggers" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "trigger_type" "TriggerType" NOT NULL,
    "status" "TriggerStatus" NOT NULL DEFAULT 'DETECTED',
    "trigger_data" JSONB NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_messages" (
    "id" TEXT NOT NULL,
    "trigger_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "OutreachPriority" NOT NULL DEFAULT 'MEDIUM',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "ai_interaction_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_rules_name_key" ON "outreach_rules"("name");

-- CreateIndex
CREATE INDEX "outreach_rules_trigger_type_idx" ON "outreach_rules"("trigger_type");

-- CreateIndex
CREATE INDEX "outreach_triggers_client_id_idx" ON "outreach_triggers"("client_id");

-- CreateIndex
CREATE INDEX "outreach_triggers_trigger_type_status_idx" ON "outreach_triggers"("trigger_type", "status");

-- CreateIndex
CREATE INDEX "outreach_triggers_detected_at_idx" ON "outreach_triggers"("detected_at");

-- CreateIndex
CREATE INDEX "outreach_messages_status_idx" ON "outreach_messages"("status");

-- CreateIndex
CREATE INDEX "outreach_messages_client_id_idx" ON "outreach_messages"("client_id");

-- CreateIndex
CREATE INDEX "outreach_messages_created_at_idx" ON "outreach_messages"("created_at");

-- AddForeignKey
ALTER TABLE "outreach_triggers" ADD CONSTRAINT "outreach_triggers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_triggers" ADD CONSTRAINT "outreach_triggers_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "outreach_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "outreach_triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
