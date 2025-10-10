// utils/tokenService.js
import logger from '../middlewares/logger.js';
import { Counter } from 'prom-client';
import UserModel from '../models/UserModel.js';

const tokenRemovalCounter = new Counter({
  name: 'fcm_token_removals_total',
  help: 'Total number of FCM tokens removed from user records',
});

export async function removeTokenFromDatabase(fcmToken) {
  try {
    const result = await UserModel.updateMany(
      { fcmToken },            
      { $unset: { fcmToken: "" } } // remove the field
    );

    if (result.modifiedCount > 0) {
      tokenRemovalCounter.inc(result.modifiedCount);
      logger.info('Unset fcmToken for user(s)', { fcmToken, count: result.modifiedCount });
      return true;
    } else {
      logger.warn('No users found with fcmToken', { fcmToken });
      return false;
    }
  } catch (err) {
    logger.error('Error removing FCM token', { fcmToken, error: err });
    throw err; 
  }
}
