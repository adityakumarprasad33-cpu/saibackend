/**
 * Shared Platform Notification Provider Abstraction
 */

export type NotificationChannel = 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';

export interface NotificationPayload {
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'HIGH' | 'NORMAL';
}

export interface ProviderDeliveryResult {
  providerId: string;
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  latencyMs: number;
}

export interface INotificationProvider {
  readonly providerId: string;
  readonly channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<ProviderDeliveryResult>;
}
