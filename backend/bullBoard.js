// bullboard.js
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { notificationQueue } from './queues/NotificationQueue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(notificationQueue)],
  serverAdapter: serverAdapter,
});

export { serverAdapter };
