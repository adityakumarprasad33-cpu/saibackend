/**
 * Versioned Case Management REST API Gateway Router (/api/v1/cases)
 */

import { Router } from 'express';
import { CaseController } from '../controllers/CaseController';
import { authMiddleware } from '../../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../../iam/api/middlewares/correlationMiddleware';
import { requireRole } from '../../../iam/api/middlewares/rbacMiddleware';

const router = Router();

router.use(correlationMiddleware);
router.use(authMiddleware);
router.use(requireRole('GovernmentOfficial', 'NodalOfficer', 'DepartmentAdmin', 'SuperAdmin'));

router.post('/accept', CaseController.accept);
router.post('/assign', CaseController.assign);
router.post('/reassign', CaseController.reassign);
router.post('/investigate', CaseController.investigate);
router.post('/resolve', CaseController.resolve);
router.post('/close', CaseController.close);
router.get('/', CaseController.list);
router.get('/dashboard/metrics', CaseController.getMetrics);
router.get('/:id', CaseController.getById);

export const caseRouter = router;
