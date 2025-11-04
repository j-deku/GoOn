-- CreateTable
CREATE TABLE `DriverProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `licenseNumber` VARCHAR(191) NOT NULL,
    `vehicleType` ENUM('Car', 'Van', 'Bus', 'Motorbike', 'Truck') NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `registrationNumber` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 4,
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `totalRides` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'active', 'inactive') NOT NULL DEFAULT 'pending',
    `approved` BOOLEAN NOT NULL DEFAULT false,
    `maxPassengers` INTEGER NOT NULL DEFAULT 4,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `documents` JSON NULL,
    `locationLat` DOUBLE NULL,
    `locationLng` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DriverProfile_userId_key`(`userId`),
    INDEX `DriverProfile_locationLat_locationLng_idx`(`locationLat`, `locationLng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DriverProfile` ADD CONSTRAINT `DriverProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
