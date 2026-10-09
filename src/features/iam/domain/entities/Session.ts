/**
 * Session Domain Entity
 *
 * Represents an active authenticated multi-device user session.
 */

export interface SessionProps {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  isRevoked: boolean;
  lastSeenAt: Date;
  revocationReason?: string;
}

export class Session {
  constructor(private readonly props: SessionProps) {}

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get isRevoked(): boolean {
    return this.props.isRevoked;
  }

  public isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  public isValid(): boolean {
    return !this.props.isRevoked && !this.isExpired();
  }

  public toJSON(): SessionProps {
    return { ...this.props };
  }
}
