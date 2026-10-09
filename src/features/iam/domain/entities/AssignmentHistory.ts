/**
 * AssignmentHistory Domain Entity
 *
 * Tracks official employee transfers, department assignments, and post changes over time.
 */

export type AssignmentStatus = 'Active' | 'Transferred' | 'Terminated';

export interface AssignmentHistoryProps {
  assignmentId: string;
  employeeId: string;
  sectorId: string;
  departmentId: string;
  postId: string;
  jurisdictionIds: string[];
  assignedBy: string;
  assignedAt: Date;
  endedAt?: Date;
  reason: string;
  status: AssignmentStatus;
}

export class AssignmentHistory {
  constructor(private readonly props: AssignmentHistoryProps) {}

  public get assignmentId(): string {
    return this.props.assignmentId;
  }

  public get employeeId(): string {
    return this.props.employeeId;
  }

  public get departmentId(): string {
    return this.props.departmentId;
  }

  public toJSON(): AssignmentHistoryProps {
    return { ...this.props };
  }
}
