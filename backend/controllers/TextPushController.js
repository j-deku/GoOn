// controllers/testPushController.js
import UserModel from "../models/UserModel.js";
import { sendPushNotification } from "../utils/pushNotification.js";

export const testPushNotification = async (req, res) => {
  const { userId, fcmToken, title, body, data } = req.body;

  try {
    let tokenToSend = fcmToken;

    if (!tokenToSend && userId) {
      const user = await UserModel.findById(userId);
      if (!user || !user.fcmToken) {
        return res.status(404).json({ success: false, message: "User or FCM token not found." });
      }
      tokenToSend = user.fcmToken;
    }

    if (!tokenToSend) {
      return res.status(400).json({ success: false, message: "fcmToken or userId is required." });
    }

    const messageId = await sendPushNotification(tokenToSend, {
      title: title || "Test Notification",
      body: body || "This is a test push notification from TOLI-TOLI.",
      data: data || { url: "/", type: "test", tag: "test" },
    });

    return res.json({ success: true, message: "Push sent", messageId });
  } catch (err) {
    console.error("Test push error:", err);
    return res.status(500).json({ success: false, message: "Failed to send push", error: err.message });
  }
};
