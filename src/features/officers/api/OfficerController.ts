/**
 * Officer Operations REST Gateway Controller (/api/v1/officers)
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../iam/api/middlewares/correlationMiddleware';
import { requireRole } from '../../iam/api/middlewares/rbacMiddleware';
import { FirestoreService } from '../../../platform/firestore/FirestoreService';
import { AuthorizationService } from '../../../platform/authorization/AuthorizationService';

export class OfficerController {
  public static async getWorkload(req: AuthenticatedRequest, res: Response): Promise<void> {
    const uid = req.user!.uid;
    const employee = await FirestoreService.getGovernmentEmployeeForUid(uid);
    if (!employee || employee.authProviderUid !== uid || employee.accountStatus !== 'Active' ||
        employee.departmentId !== req.user?.departmentId) {
      res.status(404).json({ code: 'NotFound', message: 'Officer profile is not provisioned.' });
      return;
    }
    if (!AuthorizationService.allows(req, 'grievance.list')) {
      res.status(403).json({ code: 'Forbidden', message: 'A verified officer scope is required.' });
      return;
    }
    const cases = (await FirestoreService.listOfficerGrievances(
      uid, req.user!.departmentId!, req.user!.jurisdictionIds || [],
    )).filter(item => AuthorizationService.allows(req, 'grievance.read', item));
    if (cases.length > 500) {
      res.status(503).json({ code: 'WorkloadWindowExceeded', message: 'Officer workload exceeds the bounded calculation window.' });
      return;
    }
    const count = (state: string) => cases.filter(item => item.state === state || item.status === state).length;
    res.status(200).json({
      officerId: uid,
      employeeId: employee.employeeCode,
      designation: employee.postName,
      departmentId: employee.departmentId,
      capacity: employee.caseCapacity ?? null,
      activeCases: cases.filter(item => !['Resolved', 'Closed'].includes(String(item.state || item.status))).length,
      status: employee.accountStatus,
      queues: {
        assigned: count('Assigned'),
        accepted: count('UnderReview'),
        inProgress: count('InProgress'),
        waiting: count('AwaitingInformation'),
        escalated: count('Escalated'),
        completed: cases.filter(item => ['Resolved', 'Closed'].includes(String(item.state || item.status))).length,
      },
    });
  }
}

const router = Router();
router.use(correlationMiddleware);
router.use(authMiddleware);
router.use(requireRole('GovernmentOfficial', 'NodalOfficer', 'DepartmentAdmin', 'SuperAdmin'));

router.get('/workload', OfficerController.getWorkload);

export const officerRouter = router;
