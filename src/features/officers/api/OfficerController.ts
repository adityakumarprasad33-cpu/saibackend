/**
 * Officer Operations REST Gateway Controller (/api/v1/officers)
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../iam/api/middlewares/correlationMiddleware';
import { requireRole } from '../../iam/api/middlewares/rbacMiddleware';
import { FirestoreService } from '../../../platform/firestore/FirestoreService';

export class OfficerController {
  public static async getWorkload(req: AuthenticatedRequest, res: Response): Promise<void> {
    const uid = req.user!.uid;
    const employee = (await FirestoreService.listGovernmentEmployees({})).find(item => item.authProviderUid === uid);
    if (!employee) {
      res.status(404).json({ code: 'NotFound', message: 'Officer profile is not provisioned.' });
      return;
    }
    const cases = (await FirestoreService.listAllGrievances()).filter(item =>
      (item.assignment as Record<string, unknown> | undefined)?.assignedOfficerId === uid);
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
