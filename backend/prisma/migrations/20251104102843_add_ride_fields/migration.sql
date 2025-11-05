/*
  Warnings:

  - Added the required column `passengers` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rideId` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `booking` ADD COLUMN `passengers` INTEGER NOT NULL,
    ADD COLUMN `rideId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_rideId_fkey` FOREIGN KEY (`rideId`) REFERENCES `Ride`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
