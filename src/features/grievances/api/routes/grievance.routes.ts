/**
 * Versioned Grievances API Gateway Router (/api/v1/grievances)
 */

import { Router } from 'express';
import { GrievanceController } from '../controllers/GrievanceController';
import { authMiddleware } from '../../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../../iam/api/middlewares/correlationMiddleware';

const router = Router();

router.use(correlationMiddleware);
router.use(authMiddleware);

router.post('/', GrievanceController.create);
router.get('/', GrievanceController.list);
router.get('/:id', GrievanceController.getById);
router.get('/:id/attachments', GrievanceController.listAttachments);
router.patch('/:id', GrievanceController.update);
router.get('/:id/timeline', GrievanceController.getTimeline);
router.post('/:id/comments', GrievanceController.addComment);
router.post('/:id/attachments', GrievanceController.uploadAttachment);
router.post('/:id/feedback', GrievanceController.submitFeedback);

export const grievanceRouter = router;
