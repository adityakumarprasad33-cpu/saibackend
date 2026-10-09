/**
 * Notification Domain Entity
 */

export type NotificationChannelType = 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';

export interface NotificationProps {
  id: string;
  userId: string;
  title: string;
  body: string;
  channel: NotificationChannelType;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  metadata?: Record<string, unknown>;
}

export class Notification {
  constructor(private readonly props: NotificationProps) {}

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get title(): string {
    return this.props.title;
  }

  get body(): string {
    return this.props.body;
  }

  get channel(): NotificationChannelType {
    return this.props.channel;
  }

  get isRead(): boolean {
    return this.props.isRead;
  }

  get createdAt(): string {
    return this.props.createdAt;
  }

  get readAt(): string | undefined {
    return this.props.readAt;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }

  public markAsRead(): Notification {
    return new Notification({
      ...this.props,
      isRead: true,
      readAt: new Date().toISOString(),
    });
  }

  public toJSON(): NotificationProps {
    return { ...this.props };
  }
}
