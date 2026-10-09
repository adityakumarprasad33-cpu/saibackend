/**
 * IAM Security Domain Events
 *
 * Emitted when significant security/identity events occur.
 */

export type AuthEventType =
  | 'UserRegistered'
  | 'UserLoggedIn'
  | 'UserLoggedOut'
  | 'RoleChanged'
  | 'PermissionChanged'
  | 'PasswordChanged'
  | 'AccountLocked'
  | 'AccountUnlocked';

export interface AuthDomainEvent {
  eventId: string;
  eventType: AuthEventType;
  userId: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export class AuthDomainEventPublisher {
  private static handlers: Array<(event: AuthDomainEvent) => void> = [];

  public static subscribe(handler: (event: AuthDomainEvent) => void): void {
    this.handlers.push(handler);
  }

  public static publish(event: AuthDomainEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        // Log event dispatch failures silently to prevent side-effect interruptions
      }
    }
  }
}
