-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "task_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "created_by_type" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_task_groups_channel" ON "task_groups"("channel_id");

-- CreateIndex
CREATE INDEX "idx_tasks_group" ON "tasks"("group_id");

-- AddForeignKey
ALTER TABLE "task_groups" ADD CONSTRAINT "task_groups_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "task_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
