import prisma from "../config/Db.js";

// ==============================
export const registerDevice = async (req, res) => {
  const { fcmToken, platform, appVersion } = req.body;
  const userId = req.user.id;

  try {
    const device = await prisma.device.upsert({
      where: { fcmToken },
      update: {
        platform,
        appVersion,
        lastUpdated: new Date(),
        userId,
      },
      create: {
        fcmToken,
        platform,
        appVersion,
        userId,
      },
    });

    return res.status(200).json({ success: true, device });
  } catch (error) {
    console.error('Device registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==============================
// Remove Device Token
// ==============================
export const removeDevice = async (req, res) => {
  const { token } = req.params;

  try {
    await prisma.device.delete({
      where: { fcmToken: token },
    });

    return res.json({ success: true, message: 'Device removed' });
  } catch (error) {
    console.error('Device removal error:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    return res.status(500).json({ success: false, message: 'Could not remove device' });
  }
};

// ==============================
// List All Devices for Logged-in User
// ==============================
export const listDevices = async (req, res) => {
  const userId = req.user.id;

  try {
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { lastUpdated: 'desc' },
    });

    return res.status(200).json({ success: true, devices });
  } catch (error) {
    console.error('List devices error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch devices' });
  }
};
