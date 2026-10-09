import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';

function userId(req: AuthenticatedRequest): string {
  if (!req.user?.uid) throw Object.assign(new Error('Authenticated user is required.'), { statusCode: 401 });
  return req.user.uid;
}

export class NotificationController {
  public static list = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const notifications = await FirestoreService.listNotifications(userId(req));
    res.status(200).json({ notifications, totalCount: notifications.length });
  };

  public static getUnreadCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = userId(req);
    const notifications = await FirestoreService.listNotifications(uid);
    res.status(200).json({ userId: uid, unreadCount: notifications.filter(item => item.isRead !== true).length });
  };

  public static markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = String(req.params.id || '');
    if (!id || !await FirestoreService.markNotificationRead(userId(req), id)) {
      res.status(404).json({ code: 'NotFound', message: 'Notification not found.' });
      return;
    }
    res.status(200).json({ notificationId: id, isRead: true });
  };

  public static markAllAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const count = await FirestoreService.markAllNotificationsRead(userId(req));
    res.status(200).json({ updatedCount: count });
  };

  public static getPreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const preferences = await FirestoreService.getNotificationPreferences(userId(req));
    res.status(200).json(preferences || {
      userId: userId(req),
      pushEnabled: false,
      smsEnabled: false,
      emailEnabled: false,
      inAppEnabled: true,
      updatedAt: null,
    });
  };

  public static updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const fields = ['pushEnabled', 'smsEnabled', 'emailEnabled', 'inAppEnabled'];
    const supplied = Object.fromEntries(fields.filter(field => req.body?.[field] !== undefined)
      .map(field => [field, req.body[field]]));
    if (!Object.keys(supplied).length || Object.values(supplied).some(value => typeof value !== 'boolean')) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide at least one notification preference as a boolean.' });
      return;
    }
    const uid = userId(req);
    const current = await FirestoreService.getNotificationPreferences(uid) || {};
    const updated = { ...current, ...supplied, userId: uid, updatedAt: new Date().toISOString() };
    await FirestoreService.saveNotificationPreferences(uid, updated);
    res.status(200).json(updated);
  };

  public static getHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = userId(req);
    const notifications = await FirestoreService.listNotifications(uid);
    const history = notifications.flatMap(item => Array.isArray(item.deliveryHistory) ? item.deliveryHistory : []);
    res.status(200).json({ userId: uid, history });
  };

  public static getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const item = await FirestoreService.getNotification(userId(req), String(req.params.id || ''));
    if (!item) {
      res.status(404).json({ code: 'NotFound', message: 'Notification not found.' });
      return;
    }
    res.status(200).json(item);
  };
}
