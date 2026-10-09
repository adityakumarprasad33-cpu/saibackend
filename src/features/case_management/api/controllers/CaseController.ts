import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { DashboardMetricsService } from '../../domain/services/DashboardMetricsService';

const staffRoles = new Set(['governmentofficial', 'nodalofficer', 'departmentadmin', 'superadmin']);

function canManage(req: AuthenticatedRequest, grievance: Record<string, any>): boolean {
  const role = (req.user?.roleId || '').toLowerCase();
  if (!staffRoles.has(role)) return false;
  if (role === 'superadmin') return true;
  const grievanceDepartmentId = grievance.departmentId || grievance.assignment?.departmentId;
  return Boolean(req.user?.departmentId && grievanceDepartmentId === req.user.departmentId);
}

async function findCase(id: string): Promise<Record<string, any> | null> {
  return FirestoreService.getGrievanceByPublicId(id);
}

async function requireManagedCase(req: AuthenticatedRequest, res: Response, id: string): Promise<Record<string, any> | null> {
  const grievance = await findCase(id);
  if (!grievance || !canManage(req, grievance)) {
    res.status(404).json({ code: 'NotFound', message: 'Case not found.' });
    return null;
  }
  return grievance;
}

export class CaseController {
  public static async accept(req: AuthenticatedRequest, res: Response): Promise<void> {
    const grievanceUuid = String(req.body?.grievanceUuid || '');
    if (!grievanceUuid) {
      res.status(400).json({ code: 'InvalidInput', message: 'grievanceUuid is required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, grievanceUuid);
    if (!grievance) return;
    if (grievance.state !== 'Submitted') {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be accepted from state '${grievance.state}'.` });
      return;
    }
    await FirestoreService.updateGrievance(grievance.publicId || grievance.id, { state: 'UnderReview', status: 'UnderReview' });
    await FirestoreService.addTimelineEvent(grievance.publicId || grievance.id, {
      eventType: 'UnderReview', title: 'Case accepted for review', actorUserId: req.user!.uid,
    });
    res.status(200).json({ caseId: grievance.uuid, caseNumber: grievance.publicId, grievanceUuid: grievance.uuid, status: 'UnderReview' });
  }

  public static async assign(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const officerId = String(req.body?.officerId || '');
    if (!id || !officerId) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and officerId are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id);
    if (!grievance) return;
    if (!['UnderReview', 'Assigned'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be assigned from state '${grievance.state}'.` });
      return;
    }
    await FirestoreService.updateGrievance(grievance.publicId || grievance.id, {
      state: 'Assigned', status: 'Assigned', 'assignment.assignedOfficerId': officerId,
      'assignment.assignedBy': req.user!.uid, 'assignment.assignedAt': new Date().toISOString(),
    });
    await FirestoreService.addTimelineEvent(grievance.publicId || grievance.id, {
      eventType: 'Assigned', title: 'Case assigned to an officer', actorUserId: req.user!.uid,
    });
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
    const grievance = await requireManagedCase(req, res, id);
    if (!grievance) return;
    if (!['Assigned', 'InProgress'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be reassigned from state '${grievance.state}'.` });
      return;
    }
    await FirestoreService.updateGrievance(grievance.publicId || grievance.id, {
      'assignment.assignedOfficerId': officerId, 'assignment.reassignReason': reason,
      'assignment.assignedBy': req.user!.uid, 'assignment.assignedAt': new Date().toISOString(),
    });
    await FirestoreService.addTimelineEvent(grievance.publicId || grievance.id, {
      eventType: 'Reassigned', title: 'Case reassigned', description: reason, actorUserId: req.user!.uid,
    });
    res.status(200).json({ caseId: grievance.uuid, assignedOfficerId: officerId, status: grievance.state });
  }

  public static async resolve(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const summary = String(req.body?.summary || '').trim();
    if (!id || !summary) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and resolution summary are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id);
    if (!grievance) return;
    if (!['Assigned', 'InProgress'].includes(String(grievance.state))) {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be resolved from state '${grievance.state}'.` });
      return;
    }
    await FirestoreService.updateGrievance(grievance.publicId || grievance.id, {
      state: 'Resolved', status: 'Resolved', resolutionSummary: summary, resolvedAt: new Date().toISOString(),
    });
    await FirestoreService.addTimelineEvent(grievance.publicId || grievance.id, {
      eventType: 'Resolved', title: 'Resolution proposed', description: summary, actorUserId: req.user!.uid,
    });
    res.status(200).json({ caseId: grievance.uuid, status: 'Resolved', summary });
  }

  public static async close(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.body?.caseId || '');
    const reason = String(req.body?.reason || '').trim();
    if (!id || !reason) {
      res.status(400).json({ code: 'InvalidInput', message: 'caseId and reason are required.' });
      return;
    }
    const grievance = await requireManagedCase(req, res, id);
    if (!grievance) return;
    if (grievance.state !== 'Resolved') {
      res.status(409).json({ code: 'InvalidState', message: `Case cannot be closed from state '${grievance.state}'.` });
      return;
    }
    await FirestoreService.updateGrievance(grievance.publicId || grievance.id, {
      state: 'Closed', status: 'Closed', closeReason: reason, closedAt: new Date().toISOString(),
    });
    await FirestoreService.addTimelineEvent(grievance.publicId || grievance.id, {
      eventType: 'Closed', title: 'Case closed', description: reason, actorUserId: req.user!.uid,
    });
    res.status(200).json({ caseId: grievance.uuid, status: 'Closed', reason });
  }

  public static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const grievance = await requireManagedCase(req, res, String(req.params.id || ''));
    if (!grievance) return;
    res.status(200).json({ ...grievance, caseId: grievance.uuid, caseNumber: grievance.publicId });
  }

  public static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    const rows = await FirestoreService.listAllGrievances();
    const isSuperAdmin = (req.user?.roleId || '').toLowerCase() === 'superadmin';
    const items = rows.filter(row => canManage(req, row) &&
      (isSuperAdmin || row.departmentId === req.user?.departmentId || (row.assignment as Record<string, unknown> | undefined)?.departmentId === req.user?.departmentId));
    res.status(200).json({ items, total: items.length, nextCursor: null });
  }

  public static async getMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    const rows = await FirestoreService.listAllGrievances();
    const scoped = rows.filter(row => canManage(req, row));
    res.status(200).json(DashboardMetricsService.calculateMetrics(scoped));
  }
}
