/**
 * Notification DTO Contracts
 */

export interface NotificationResponseDTO {
  id: string;
  userId: string;
  title: string;
  body: string;
  channel: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface NotificationUnreadCountDTO {
  userId: string;
  unreadCount: number;
}

export interface NotificationPreferenceDTO {
  userId: string;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}

export interface NotificationHistoryDTO {
  id: string;
  notificationId: string;
  channel: string;
  status: 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
  dispatchedAt: string;
}
