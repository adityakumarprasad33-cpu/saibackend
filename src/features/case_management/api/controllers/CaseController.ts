import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { DashboardMetricsService } from '../../domain/services/DashboardMetricsService';
import { AuthorizationAction, AuthorizationService } from '../../../../platform/authorization/AuthorizationService';

async function findCase(id: string): Promise<Record<string, any> | null> {
  return FirestoreService.getGrievanceByPublicId(id);
}

async function requireManagedCase(
  req: AuthenticatedRequest,
  res: Response,
  id: string,
  action: AuthorizationAction,
): Promise<Record<string, any> | null> {
  const grievance = await findCase(id);
  if (!grievance || !AuthorizationService.allows(req, action, grievance)) {
    res.status(404).json({ code: 'NotFound', message: 'Case not found.' });
    return null;
  }
  return grievance;
}

async function isValidAssignmentTarget(grievance: Record<string, any>, uid: string): Promise<boolean> {
  const employee = await FirestoreService.getGovernmentEmployeeForUid(uid);
  const jurisdictions = Array.isArray(employee?.jurisdictionIds) ? employee.jurisdictionIds : [];
  const identityAndScopeMatch = Boolean(
    employee && employee.employeeId === uid && employee.authProviderUid === uid &&
    employee.accountStatus === 'Active' && employee.identityVerificationStatus === 'Verified' &&
    ['GovernmentOfficial', 'NodalOfficer'].includes(String(employee.primaryRole)) &&
    typeof grievance.departmentId === 'string' && employee.departmentId === grievance.departmentId &&
    typeof grievance.jurisdictionId === 'string' && jurisdictions.includes(grievance.jurisdictionId),
  );
  return identityAndScopeMatch && await FirestoreService.validateGovernmentEmployeeScope(employee!);
}

export class CaseController {
  public static async accept(req: AuthenticatedRequest, res: Response): Promise<void> {
    const grievanceUuid = String(req.body?.grievanceUuid || '');
    if (!grievanceUuid) {
      res.status(400).json({ code: 'InvalidInput', message: 'grievanceUuid is required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, grievanceUuid, 'case.accept');
    if (!grievance) return;
    if (grievance.state !== 'Submitted') {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be accepted from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id, String(grievance.state), Number(grievance.version || 0),
      { state: 'UnderReview', status: 'UnderReview' }, {
      eventType: 'UnderReview', title: 'Case accepted for review', actorUserId: req.user!.uid,
      },
      { actorUid: req.user!.uid, permission: 'case.accept' },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, caseNumber: grievance.publicId, grievanceUuid: grievance.uuid, status: 'UnderReview' });
  }

  public static async assign(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const officerId = String(req.body?.officerId || '');
    if (!id || !officerId) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and officerId are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id, 'case.assign');
    if (!grievance) return;
    if (!await isValidAssignmentTarget(grievance, officerId)) {
      res.status(400).json({ code: 'InvalidAssignmentTarget', message: 'The target officer is inactive or outside this case scope.' });
      return;
    }
    if (!['UnderReview', 'Assigned'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be assigned from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id, String(grievance.state), Number(grievance.version || 0), {
      state: 'Assigned', status: 'Assigned', 'assignment.assignedOfficerId': officerId,
      'assignment.assignedBy': req.user!.uid, 'assignment.assignedAt': new Date().toISOString(),
      }, {
      eventType: 'Assigned', title: 'Case assigned to an officer', actorUserId: req.user!.uid,
      },
      { actorUid: req.user!.uid, permission: 'case.assign', assignmentTargetUid: officerId },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, assignedOfficerId: officerId, status: 'Assigned' });
  }

  public static async reassign(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const officerId = String(req.body?.officerId || '');
    const reason = String(req.body?.reason || '').trim();
    if (!id || !officerId || !reason) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId, officerId, and reason are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id, 'case.reassign');
    if (!grievance) return;
    if (!await isValidAssignmentTarget(grievance, officerId)) {
      res.status(400).json({ code: 'InvalidAssignmentTarget', message: 'The target officer is inactive or outside this case scope.' });
      return;
    }
    if (!['Assigned', 'InProgress'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be reassigned from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id, String(grievance.state), Number(grievance.version || 0), {
      'assignment.assignedOfficerId': officerId, 'assignment.reassignReason': reason,
      'assignment.assignedBy': req.user!.uid, 'assignment.assignedAt': new Date().toISOString(),
      }, {
      eventType: 'Reassigned', title: 'Case reassigned', description: reason, actorUserId: req.user!.uid,
      },
      { actorUid: req.user!.uid, permission: 'case.reassign', assignmentTargetUid: officerId },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, assignedOfficerId: officerId, status: grievance.state });
  }

  public static async investigate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const note = String(req.body?.note || '').trim();
    if (!id || note.length < 8 || note.length > 2000) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and an investigation note of 8-2000 characters are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id, 'case.investigate');
    if (!grievance) return;
    if (req.user!.roleId.toLowerCase() === 'governmentofficial' &&
        grievance.assignment?.assignedOfficerId !== req.user!.uid) {
      res.status(404).json({ code: 'NotFound', message: 'Case not found.' });
      return;
    }
    if (grievance.state !== 'Assigned') {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot enter investigation from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id,
      String(grievance.state),
      Number(grievance.version || 0),
      { state: 'InProgress', status: 'InProgress', investigationStartedAt: new Date().toISOString(), investigationStartedBy: req.user!.uid },
      { eventType: 'InvestigationStarted', title: 'Case investigation started', description: note, actorUserId: req.user!.uid, visibility: 'Internal' },
      { actorUid: req.user!.uid, permission: 'case.investigate' },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case or your current authorization changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, status: 'InProgress' });
  }

  public static async resolve(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const summary = String(req.body?.summary || '').trim();
    if (!id || !summary) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and resolution summary are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id, 'case.resolve');
    if (!grievance) return;
    if (!['Assigned', 'InProgress'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be resolved from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id, String(grievance.state), Number(grievance.version || 0), {
      state: 'Resolved', status: 'Resolved', resolutionSummary: summary, resolvedAt: new Date().toISOString(),
      }, {
      eventType: 'Resolved', title: 'Resolution proposed', description: summary, actorUserId: req.user!.uid,
      },
      { actorUid: req.user!.uid, permission: 'case.resolve' },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, status: 'Resolved', summary });
  }

  public static async close(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const reason = String(req.body?.reason || '').trim();
    if (!id || !reason) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and reason are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id, 'case.close');
    if (!grievance) return;
    if (grievance.state !== 'Resolved') {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be closed from state '${grievance.state}'.` });
      return;
    }
    const committed = await FirestoreService.commitGrievanceWorkflow(
      grievance.publicId || grievance.id, String(grievance.state), Number(grievance.version || 0), {
      state: 'Closed', status: 'Closed', closeReason: reason, closedAt: new Date().toISOString(),
      }, {
      eventType: 'Closed', title: 'Case closed', description: reason, actorUserId: req.user!.uid,
      },
      { actorUid: req.user!.uid, permission: 'case.close' },
    );
    if (!committed) {
      res.status(409).json({ code: 'WorkflowConflict', message: 'The case changed during this request. Reload and try again.' });
      return;
    }
    res.status(200).json({ caseId: grievance.uuid, status: 'Closed', reason });
  }

  public static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const grievance = await requireManagedCase(req, res, String(req.params.id || ''), 'grievance.read');
    if (!grievance) return;
    res.status(200).json({ ...grievance, caseId: grievance.uuid, caseNumber: grievance.publicId });
  }

  public static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!AuthorizationService.allows(req, 'grievance.list')) {
      res.status(403).json({ code: 'Forbidden', message: 'A verified case scope is required.' });
      return;
    }
    const requestedLimit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      res.status(400).json({ code: 'InvalidLimit', message: 'limit must be an integer from 1 to 100.' });
      return;
    }
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const result = await FirestoreService.listScopedGrievances(
      req.user!.departmentId || '', req.user!.jurisdictionIds || [], requestedLimit, cursor,
    );
    const items = result.items.filter(item => AuthorizationService.allows(req, 'grievance.read', item));
    res.status(200).json({ items, total: items.length, nextCursor: result.nextCursor });
  }

  public static async getMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!AuthorizationService.allows(req, 'case.metrics.read')) {
      res.status(403).json({ code: 'Forbidden', message: 'A verified case scope is required.' });
      return;
    }
    const rows = await FirestoreService.listAllScopedGrievances(
      req.user!.departmentId || '', req.user!.jurisdictionIds || [],
    );
    if (rows.length > 1000) {
      res.status(503).json({ code: 'MetricsWindowExceeded', message: 'Scoped metrics exceed the bounded calculation window.' });
      return;
    }
    const scoped = rows.filter(row => AuthorizationService.allows(req, 'grievance.read', row));
    res.status(200).json(DashboardMetricsService.calculateMetrics(scoped));
  }
}
