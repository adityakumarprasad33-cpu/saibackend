/**
 * Grievance Domain Entity Aggregate Root
 */

export type GrievanceState =
  | 'Draft'
  | 'Submitted'
  | 'UnderReview'
  | 'Assigned'
  | 'InProgress'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface LocationMetadata {
  latitude?: number | undefined;
  longitude?: number | undefined;
  addressText: string;
  pincode: string;
  district: string;
  stateCode: string;
}

export interface GrievanceProps {
  uuid: string;
  publicId: string;
  citizenUserId: string;
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string | undefined;
  departmentId?: string | undefined;
  priority: PriorityLevel;
  state: GrievanceState;
  location: LocationMetadata;
  attachmentIds: string[];
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date | undefined;
  resolvedAt?: Date | undefined;
  closedAt?: Date | undefined;
}

export class Grievance {
  constructor(private readonly props: GrievanceProps) {}

  public get uuid(): string {
    return this.props.uuid;
  }

  public get publicId(): string {
    return this.props.publicId;
  }

  public get state(): GrievanceState {
    return this.props.state;
  }

  public get priority(): PriorityLevel {
    return this.props.priority;
  }

  public toJSON(): GrievanceProps {
    return { ...this.props };
  }
}
