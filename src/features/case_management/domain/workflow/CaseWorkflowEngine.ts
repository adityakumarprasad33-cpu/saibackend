/**
 * Configuration-Driven Case Workflow Engine
 *
 * Pipeline: Transition -> Validation -> Business Rule -> Domain Event
 */

import { CaseStatus } from '../aggregates/ManagedCase';
import { PlatformEventBus, PlatformDomainEvent } from '../../../../platform/events/DomainEvent';

export interface WorkflowTransitionRule {
  from: CaseStatus;
  to: CaseStatus;
  requiredRole?: string | undefined;
  eventName: string;
}

export class CaseWorkflowEngine {
  private static readonly rules: WorkflowTransitionRule[] = [
    { from: 'PendingAcceptance', to: 'Accepted', eventName: 'CaseAccepted' },
    { from: 'Accepted', to: 'Assigned', eventName: 'CaseAssigned' },
    { from: 'Assigned', to: 'Investigation', eventName: 'InvestigationStarted' },
    { from: 'Investigation', to: 'AwaitingInformation', eventName: 'InformationRequested' },
    { from: 'Investigation', to: 'ResolutionProposed', eventName: 'ResolutionProposed' },
    { from: 'AwaitingInformation', to: 'Investigation', eventName: 'InformationReceived' },
    { from: 'ResolutionProposed', to: 'Closed', eventName: 'CaseClosed' },
    { from: 'ResolutionProposed', to: 'Reopened', eventName: 'CaseReopened' },
    { from: 'Reopened', to: 'Assigned', eventName: 'CaseReassigned' },
  ];

  public static executeTransition(caseId: string, current: CaseStatus, next: CaseStatus): boolean {
    const rule = this.rules.find((r) => r.from === current && r.to === next);
    if (!rule) {
      throw new Error(`WorkflowError: Invalid case transition from '${current}' to '${next}'`);
    }

    // Publish domain reporting event to platform event bus
    const event: PlatformDomainEvent = {
      eventId: `evt-${Date.now()}`,
      eventName: rule.eventName,
      boundedContext: 'case_management',
      aggregateId: caseId,
      timestamp: new Date(),
      version: 1,
      payload: { from: current, to: next },
    };

    PlatformEventBus.publish(event);
    return true;
  }
}
