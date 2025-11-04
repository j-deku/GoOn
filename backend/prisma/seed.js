// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1️⃣ Create a default admin user
  const adminEmail = 'admin@goon.com';
  const adminPassword = await bcrypt.hash('Admin@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Admin',
      email: adminEmail,
      password: adminPassword,
      verified: true,
    },
  });

  // 2️⃣ Assign ADMIN role to this user
  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role: {
        userId: adminUser.id,
        role: 'ADMIN',
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      role: 'ADMIN',
    },
  });

  // 3️⃣ Optionally, create a sample driver and user
  const driverEmail = 'driver@goon.com';
  const driverPassword = await bcrypt.hash('Driver@123', 10);
  const driverUser = await prisma.user.upsert({
    where: { email: driverEmail },
    update: {},
    create: {
      name: 'John Driver',
      email: driverEmail,
      password: driverPassword,
      verified: true,
    },
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role: {
        userId: driverUser.id,
        role: 'DRIVER',
      },
    },
    update: {},
    create: {
      userId: driverUser.id,
      role: 'DRIVER',
    },
  });

  const normalUserEmail = 'user@goon.com';
  const userPassword = await bcrypt.hash('User@123', 10);
  const normalUser = await prisma.user.upsert({
    where: { email: normalUserEmail },
    update: {},
    create: {
      name: 'Jane Passenger',
      email: normalUserEmail,
      password: userPassword,
      verified: true,
    },
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role: {
        userId: normalUser.id,
        role: 'USER',
      },
    },
    update: {},
    create: {
      userId: normalUser.id,
      role: 'USER',
    },
  });

  await prisma.notification.create({
  data: {
    title: "System Welcome",
    body: "Welcome to GoOn!",
    userId: adminUser.id,
    type: "SYSTEM",
  },
});

  // Ensure there’s at least one driver user
  const driver = await prisma.user.upsert({
    where: { email: "driver@example.com" },
    update: {},
    create: {
      name: "John Driver",
      email: "driver@example.com",
      password: "hashed_password_here", // replace with bcrypt hash later
      verified: true,
      roleAssignments: {
        create: { role: "DRIVER" },
      },
    },
  });

  // ✅ Create or update DriverProfile
  await prisma.driverProfile.upsert({
    where: { userId: driver.id },
    update: {},
    create: {
      userId: driver.id,
      phone: "+233500000001",
      licenseNumber: "DRV-12345-GH",
      vehicleType: "Car",
      model: "Toyota Corolla 2019",
      registrationNumber: "GT-5678-19",
      capacity: 4,
      maxPassengers: 4,
      isAvailable: true,
      approved: true,
      documents: JSON.stringify(["license.jpg", "insurance.pdf"]),
      locationLat: 5.6037,
      locationLng: -0.1870,
      status: "active",
    },
  });

  console.log("✅ Driver profile created!");

  console.log('✅ Seeding complete!');
  console.table([
    { Role: 'ADMIN', Email: adminEmail },
    { Role: 'DRIVER', Email: driverEmail },
    { Role: 'USER', Email: normalUserEmail },
  ]);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });