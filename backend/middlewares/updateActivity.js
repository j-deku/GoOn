// middlewares/updateActivity.js
import prisma from "../config/Db.js";

export const updateUserActivity = async (req, res, next) => {
  try {
    if (req.user?.id) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { 
          lastActiveAt: new Date(), 
          isOnline: true 
        },
      });
    }
  } catch (err) {
    console.error("Activity update error:", err.message);
  }
  next();
};
