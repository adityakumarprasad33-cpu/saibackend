/**
 * Sector Domain Entity
 *
 * Represents high-level government operational sectors (Public Works, Health, Power, etc.)
 */

export type SectorStatus = 'Active' | 'Inactive' | 'Archived';

export interface SectorProps {
  sectorId: string;
  code: string;
  name: string;
  description: string;
  status: SectorStatus;
  parentSectorId?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export class Sector {
  constructor(private readonly props: SectorProps) {}

  public get sectorId(): string {
    return this.props.sectorId;
  }

  public get code(): string {
    return this.props.code;
  }

  public get name(): string {
    return this.props.name;
  }

  public get status(): SectorStatus {
    return this.props.status;
  }

  public toJSON(): SectorProps {
    return { ...this.props };
  }
}
