import { generateBackupCodes } from "../utils/generateBackupCodes.js";
import AdminProfile from "../models/AdminProfile.js";

const regenerateBackupCodes = async (req, res) => {
  const user = await UserModel.findById(req.preAdminId);
  if (!user) {
    return res.status(404).json({ success: false, message: "Admin not found." });
  }
  const admin = await AdminProfile.findOne({ user: user._id });
  if (!admin) {
    return res.status(404).json({ success: false, message: "Admin profile not found." });
  }

  const { plainCodes, codes } = await generateBackupCodes();
  admin.backupCodes = codes;
  admin.backupCodesGeneratedAt = new Date();
  await admin.save();

  return res.status(200).json({ success: true, backupCodes: plainCodes });
};

export default regenerateBackupCodes;