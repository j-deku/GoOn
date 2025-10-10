import express from "express"
import { testPushNotification } from "../controllers/TextPushController.js";
import { verifyAdmin } from "../middlewares/adminAuth.js";

const TestPushRouter = express.Router();
TestPushRouter.use(verifyAdmin);

TestPushRouter.post("/test-push", testPushNotification);

export default TestPushRouter;