// jobs/markOffline.js
import prisma from "../config/Db.js";

export const markInactiveUsersOffline = async () => {
  const FIVE_MINUTES_AGO = new Date(Date.now() - 5 * 60 * 1000);

  await prisma.user.updateMany({
    where: {
      lastActiveAt: { lt: FIVE_MINUTES_AGO },
      isOnline: true,
    },
    data: { isOnline: false },
  });
};
