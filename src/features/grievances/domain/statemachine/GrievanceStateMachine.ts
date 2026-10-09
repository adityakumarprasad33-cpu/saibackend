/**
 * Grievance State Machine Lifecycle Engine
 *
 * Enforces valid state transitions:
 * Draft -> Submitted -> UnderReview -> Assigned -> InProgress -> Resolved -> Closed -> Reopened
 */

import { GrievanceState } from '../entities/Grievance';

export class InvalidStateTransitionError extends Error {
  constructor(from: GrievanceState, to: GrievanceState) {
    super(`InvalidStateTransition: Cannot transition grievance state from '${from}' to '${to}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class GrievanceStateMachine {
  private static readonly allowedTransitions: Record<GrievanceState, GrievanceState[]> = {
    Draft: ['Submitted'],
    Submitted: ['UnderReview', 'Closed'],
    UnderReview: ['Assigned', 'Closed'],
    Assigned: ['InProgress', 'Assigned'],
    InProgress: ['Resolved'],
    Resolved: ['Closed', 'Reopened'],
    Closed: [],
    Reopened: ['Assigned', 'InProgress'],
  };

  public static validateTransition(current: GrievanceState, next: GrievanceState): boolean {
    const allowed = this.allowedTransitions[current];
    if (!allowed || !allowed.includes(next)) {
      throw new InvalidStateTransitionError(current, next);
    }
    return true;
  }
}
