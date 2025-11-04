/*
  Warnings:

  - You are about to drop the column `activity` on the `activitylog` table. All the data in the column will be lost.
  - You are about to drop the column `adminEmail` on the `activitylog` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `activitylog` table. All the data in the column will be lost.
  - Added the required column `description` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `activitylog` DROP FOREIGN KEY `ActivityLog_userId_fkey`;

-- DropIndex
DROP INDEX `ActivityLog_userId_fkey` ON `activitylog`;

-- AlterTable
ALTER TABLE `activitylog` DROP COLUMN `activity`,
    DROP COLUMN `adminEmail`,
    DROP COLUMN `timestamp`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `description` VARCHAR(191) NOT NULL,
    ADD COLUMN `ipAddress` VARCHAR(191) NULL,
    ADD COLUMN `role` ENUM('USER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN', 'ADMIN_MANAGER') NULL,
    ADD COLUMN `userAgent` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `notification` MODIFY `message` VARCHAR(191) NULL DEFAULT 'Welcome back to GoOn. Start booking your rides now!';

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
