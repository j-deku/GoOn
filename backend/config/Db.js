import { PrismaClient } from "@prisma/client";
import logger from "../middlewares/logger.js";

const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

export const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info("✅ Prisma: Database connected successfully");
  } catch (error) {
    logger.error("❌ Prisma: Failed to connect to database:", error.message);
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await prisma.$disconnect();
    logger.info("🔌 Prisma: Disconnected due to app termination");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await prisma.$disconnect();
    logger.info("🔌 Prisma: Disconnected due to server shutdown");
    process.exit(0);
  });
};

export default prisma;
