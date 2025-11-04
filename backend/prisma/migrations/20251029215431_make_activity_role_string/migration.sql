/*
  Warnings:

  - You are about to alter the column `role` on the `activitylog` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(4))` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `activitylog` MODIFY `role` VARCHAR(191) NULL;
