import express from 'express';
import { listDevices, registerDevice, removeDevice } from '../controllers/DeviceController.js';
import authMiddleware from '../middlewares/auth.js';

const DeviceRouter = express.Router();

DeviceRouter.post('/register', authMiddleware, registerDevice);
DeviceRouter.delete('/:token', authMiddleware, removeDevice);
DeviceRouter.get('/', authMiddleware, listDevices);

export default DeviceRouter;