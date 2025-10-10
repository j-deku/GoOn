import express from 'express';
import connectionCheck from '../controllers/connectionCheckController.js';
import rateLimit from 'express-rate-limit';

const connectionRoute = express.Router();
// Rate limiting
const pingLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 100,           
  standardHeaders: true,
  legacyHeaders: false,
});


connectionRoute.get("/ping",pingLimiter, connectionCheck);

export default connectionRoute;