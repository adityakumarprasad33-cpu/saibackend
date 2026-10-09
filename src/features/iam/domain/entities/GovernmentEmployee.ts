/**
 * GovernmentEmployee Domain Entity
 *
 * Defines official government personnel attributes, organizational assignments,
 * jurisdiction bounds, and account status transitions.
 */

export type EmployeeAccountStatus = 'PendingActivation' | 'Active' | 'Suspended' | 'Disabled' | 'Transferred';
export type EmploymentStatus = 'FullTime' | 'Deputation' | 'Contractual' | 'Probation';
export type IdentityVerificationStatus = 'Unverified' | 'Verified' | 'Revoked';

export interface GovernmentEmployeeProps {
  employeeId: string;
  authProviderUid: string;
  employeeCode: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  sectorId: string;
  departmentId: string;
  postId: string;
  primaryRole: string;
  permissionVersion: number;
  jurisdictionIds: string[];
  accountStatus: EmployeeAccountStatus;
  employmentStatus: EmploymentStatus;
  identityVerificationStatus: IdentityVerificationStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  lastLoginAt?: Date;
  securityVersion: number;
}

export class GovernmentEmployee {
  constructor(private readonly props: GovernmentEmployeeProps) {}

  public get employeeId(): string {
    return this.props.employeeId;
  }

  public get authProviderUid(): string {
    return this.props.authProviderUid;
  }

  public get employeeCode(): string {
    return this.props.employeeCode;
  }

  public get fullName(): string {
    return this.props.fullName;
  }

  public get email(): string {
    return this.props.email;
  }

  public get sectorId(): string {
    return this.props.sectorId;
  }

  public get departmentId(): string {
    return this.props.departmentId;
  }

  public get postId(): string {
    return this.props.postId;
  }

  public get primaryRole(): string {
    return this.props.primaryRole;
  }

  public get jurisdictionIds(): string[] {
    return [...this.props.jurisdictionIds];
  }

  public get accountStatus(): EmployeeAccountStatus {
    return this.props.accountStatus;
  }

  public isActive(): boolean {
    return this.props.accountStatus === 'Active';
  }

  public toJSON(): GovernmentEmployeeProps {
    return { ...this.props };
  }
}
