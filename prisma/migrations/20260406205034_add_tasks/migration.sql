-- DropIndex
DROP INDEX "idx_messages_top_level";

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "task_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "created_by_type" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "claimed_by_type" TEXT,
    "claimed_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_message_id_key" ON "tasks"("message_id");

-- CreateIndex
CREATE INDEX "idx_tasks_channel_status" ON "tasks"("channel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_channel_id_task_number_key" ON "tasks"("channel_id", "task_number");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
