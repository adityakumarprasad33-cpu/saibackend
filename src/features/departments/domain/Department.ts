/**
 * Department Domain Aggregate
 */

export type DepartmentType = 'State' | 'District' | 'Subdivision' | 'Block' | 'Local';

export interface DepartmentProps {
  departmentId: string;
  name: string;
  code: string;
  type: DepartmentType;
  parentDepartmentId?: string | undefined;
  jurisdictionCode: string;
  workingHours: string;
  holidayCalendarRef: string;
  escalationPolicyRef: string;
  officerCapacity: number;
}

export class Department {
  constructor(private readonly props: DepartmentProps) {}

  public get departmentId(): string {
    return this.props.departmentId;
  }

  public get name(): string {
    return this.props.name;
  }

  public get jurisdictionCode(): string {
    return this.props.jurisdictionCode;
  }

  public toJSON(): DepartmentProps {
    return { ...this.props };
  }
}
