/**
 * Versioned Grievances API Gateway Router (/api/v1/grievances)
 */

import { Router } from 'express';
import { GrievanceController } from '../controllers/GrievanceController';
import { authMiddleware } from '../../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../../iam/api/middlewares/correlationMiddleware';
import { requirePermission, requireRole } from '../../../iam/api/middlewares/rbacMiddleware';

const router = Router();

router.use(correlationMiddleware);
router.use(authMiddleware);

router.get('/triage', requireRole('NodalOfficer', 'DepartmentAdmin', 'SuperAdmin'), requirePermission('grievance.triage.read'), GrievanceController.listTriage);
router.post('/:id/route', requireRole('NodalOfficer', 'DepartmentAdmin', 'SuperAdmin'), requirePermission('grievance.triage.route'), GrievanceController.routeFromTriage);
router.post('/', GrievanceController.create);
router.get('/', GrievanceController.list);
router.get('/:id', GrievanceController.getById);
router.get('/:id/attachments', GrievanceController.listAttachments);
router.get('/:id/timeline', GrievanceController.getTimeline);
router.post('/:id/comments', GrievanceController.addComment);
router.post('/:id/attachments', GrievanceController.uploadAttachment);
router.post('/:id/feedback', GrievanceController.submitFeedback);

export const grievanceRouter = router;
