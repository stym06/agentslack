-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "project_id" UUID;

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "repo_path" TEXT NOT NULL,
    "git_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "worktree_path" TEXT,
    "branch_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_projects_channel" ON "projects"("channel_id");

-- CreateIndex
CREATE INDEX "idx_sessions_agent_status" ON "agent_sessions"("agent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sessions_agent_id_task_id_key" ON "agent_sessions"("agent_id", "task_id");

-- CreateIndex
CREATE INDEX "idx_tasks_project" ON "tasks"("project_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
