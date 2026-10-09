/**
 * ApplicationUser Domain Entity
 *
 * Owns the user profile state, account status transitions, and metadata
 * independently of external Identity Providers (Firebase, DigiLocker, etc.).
 */

export type AccountState =
  | 'PendingVerification'
  | 'Active'
  | 'Suspended'
  | 'Disabled'
  | 'Deleted'
  | 'Blocked';

export type VerificationStatus = 'Unverified' | 'Verified' | 'Rejected';

export type AuthProviderType = 'firebase' | 'digilocker' | 'gov_sso' | 'oauth2';

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface ApplicationUserProps {
  userId: string;
  identityUid: string;
  provider: AuthProviderType;
  email: string;
  phone: string;
  displayName: string;
  photoUrl?: string;
  roleId: string;
  departmentId?: string;
  designation?: string;
  accountState: AccountState;
  verificationStatus: VerificationStatus;
  languagePreference: string;
  notificationPreferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  lastPasswordChangeAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  metadata: Record<string, unknown>;
}

export class ApplicationUser {
  constructor(private readonly props: ApplicationUserProps) {}

  public get userId(): string {
    return this.props.userId;
  }

  public get identityUid(): string {
    return this.props.identityUid;
  }

  public get email(): string {
    return this.props.email;
  }

  public get roleId(): string {
    return this.props.roleId;
  }

  public get accountState(): AccountState {
    return this.props.accountState;
  }

  public isActive(): boolean {
    return this.props.accountState === 'Active';
  }

  public isLocked(): boolean {
    if (this.props.accountState === 'Blocked') return true;
    if (this.props.lockedUntil && this.props.lockedUntil > new Date()) return true;
    return false;
  }

  public toJSON(): ApplicationUserProps {
    return { ...this.props };
  }
}
