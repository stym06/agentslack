-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_channel_id_fkey";

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "channel_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
