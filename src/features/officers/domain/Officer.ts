/**
 * Officer Domain Aggregate
 */

export type OfficerStatus = 'Active' | 'OnLeave' | 'Transferred' | 'Inactive';

export interface OfficerProps {
  officerId: string;
  employeeId: string;
  designation: string;
  rank: string;
  departmentId: string;
  office: string;
  jurisdiction: string;
  specialization: string[];
  capacity: number;
  activeCases: number;
  workingHours: string;
  supervisorId?: string | undefined;
  status: OfficerStatus;
}

export class Officer {
  constructor(private readonly props: OfficerProps) {}

  public get officerId(): string {
    return this.props.officerId;
  }

  public get employeeId(): string {
    return this.props.employeeId;
  }

  public get status(): OfficerStatus {
    return this.props.status;
  }

  public get capacity(): number {
    return this.props.capacity;
  }

  public get activeCases(): number {
    return this.props.activeCases;
  }

  public toJSON(): OfficerProps {
    return { ...this.props };
  }
}
