/**
 * Assignment Strategy Interface Contract & Implementations
 */

import { Officer } from '../../../officers/domain/Officer';
import { ManagedCase } from '../aggregates/ManagedCase';

export interface IAssignmentStrategy {
  strategyName: string;
  selectOfficer(caseItem: ManagedCase, candidateOfficers: Officer[]): Officer | null;
}

export class WorkloadStrategy implements IAssignmentStrategy {
  public readonly strategyName = 'WorkloadStrategy';

  public selectOfficer(_caseItem: ManagedCase, candidateOfficers: Officer[]): Officer | null {
    const available = candidateOfficers.filter((o) => o.status === 'Active' && o.activeCases < o.capacity);
    if (available.length === 0) return null;

    available.sort((a, b) => a.activeCases - b.activeCases);
    return available[0] || null;
  }
}
