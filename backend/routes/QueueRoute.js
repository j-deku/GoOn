import express from "express";
import { verifyAdmin } from "../middlewares/adminAuth.js";
import { queueStatus } from "../controllers/DebugController.js";

const debugRouter = express.Router();
debugRouter.get(
  "/queue-status",
  verifyAdmin,
  queueStatus
);
export default debugRouter;
