/**
 * Versioned Notification REST API Gateway Router (/api/v1/notifications)
 */

import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authMiddleware } from '../../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../../iam/api/middlewares/correlationMiddleware';

const router = Router();

router.use(correlationMiddleware);
router.use(authMiddleware);

router.get('/', NotificationController.list);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/:id/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);
router.get('/history', NotificationController.getHistory);
router.get('/:id', NotificationController.getById);

export const notificationRouter = router;
