import crypto from "crypto";
import bcrypt from "bcryptjs";

export async function generateBackupCodes(count = 10) {
  // Generate plain codes
  const plainCodes = Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
  // Hash codes for storage
  const codes = await Promise.all(
    plainCodes.map(async (code) => ({
      code: await bcrypt.hash(code, 10),
      used: false,
    }))
  );
  return { plainCodes, codes };
}