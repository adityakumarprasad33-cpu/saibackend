/**
 * CaseAssignmentEngine
 *
 * Policy-driven case assignment engine executing pluggable assignment strategies.
 */

import { IAssignmentStrategy, WorkloadStrategy } from './IAssignmentStrategy';
import { ManagedCase } from '../aggregates/ManagedCase';
import { Officer } from '../../../officers/domain/Officer';

export class CaseAssignmentEngine {
  private strategy: IAssignmentStrategy;

  constructor(strategy?: IAssignmentStrategy) {
    this.strategy = strategy || new WorkloadStrategy();
  }

  public setStrategy(strategy: IAssignmentStrategy): void {
    this.strategy = strategy;
  }

  public assign(caseItem: ManagedCase, officers: Officer[]): Officer | null {
    return this.strategy.selectOfficer(caseItem, officers);
  }
}
