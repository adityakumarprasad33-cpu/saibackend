/**
 * ManagedCase Aggregate Root
 *
 * Dedicated aggregate for government investigation case management with optimistic concurrency locking.
 */

export type CaseStatus =
  | 'PendingAcceptance'
  | 'Accepted'
  | 'Assigned'
  | 'Investigation'
  | 'AwaitingInformation'
  | 'ResolutionProposed'
  | 'SupervisorReview'
  | 'CitizenFeedback'
  | 'Closed'
  | 'Reopened';

export type CasePriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type CaseSeverity = 'Minor' | 'Moderate' | 'Major' | 'Critical';
export type CaseSource = 'CitizenApp' | 'WebPortal' | 'Kiosk' | 'CallCenter';

export interface ManagedCaseProps {
  caseId: string;
  caseNumber: string;
  grievanceUuid: string;
  publicGrievanceId: string;
  departmentId: string;
  assignedOfficerId?: string | undefined;
  status: CaseStatus;
  priority: CasePriority;
  severity: CaseSeverity;
  source: CaseSource;
  createdBy: string;
  acceptedBy?: string | undefined;
  closedBy?: string | undefined;
  closedReason?: string | undefined;
  lastActivityAt: Date;
  estimatedResolutionDate: Date;
  actualResolutionDate?: Date | undefined;
  reopenedCount: number;
  version: number;
}

export class ManagedCase {
  constructor(private readonly props: ManagedCaseProps) {}

  public get caseId(): string {
    return this.props.caseId;
  }

  public get caseNumber(): string {
    return this.props.caseNumber;
  }

  public get status(): CaseStatus {
    return this.props.status;
  }

  public get version(): number {
    return this.props.version;
  }

  public assignOfficer(officerId: string): void {
    this.props.assignedOfficerId = officerId;
    this.props.lastActivityAt = new Date();
    this.props.version += 1;
  }

  public toJSON(): ManagedCaseProps {
    return { ...this.props };
  }
}
