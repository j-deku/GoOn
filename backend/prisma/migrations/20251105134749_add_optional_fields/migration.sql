-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `Booking_rideId_fkey`;

-- DropIndex
DROP INDEX `Booking_rideId_fkey` ON `booking`;

-- AlterTable
ALTER TABLE `booking` MODIFY `passengers` INTEGER NULL,
    MODIFY `rideId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_rideId_fkey` FOREIGN KEY (`rideId`) REFERENCES `Ride`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
