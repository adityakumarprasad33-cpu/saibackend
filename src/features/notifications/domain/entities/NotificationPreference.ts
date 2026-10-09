/**
 * Notification Preference Domain Entity
 */

export interface NotificationPreferenceProps {
  userId: string;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}

export class NotificationPreference {
  constructor(private readonly props: NotificationPreferenceProps) {}

  get userId(): string {
    return this.props.userId;
  }

  get pushEnabled(): boolean {
    return this.props.pushEnabled;
  }

  get smsEnabled(): boolean {
    return this.props.smsEnabled;
  }

  get emailEnabled(): boolean {
    return this.props.emailEnabled;
  }

  get inAppEnabled(): boolean {
    return this.props.inAppEnabled;
  }

  get updatedAt(): string {
    return this.props.updatedAt;
  }

  public toJSON(): NotificationPreferenceProps {
    return { ...this.props };
  }
}
