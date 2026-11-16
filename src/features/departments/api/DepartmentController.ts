/**
 * Department Operations REST Gateway Controller (/api/v1/departments)
 */

import { Response, Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../iam/api/middlewares/correlationMiddleware';
import { FirestoreService } from '../../../platform/firestore/FirestoreService';
import { rateGuardMiddleware } from '../../../platform/rateguard/middleware/rateGuardMiddleware';

export class DepartmentController {
  public static async list(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const items = await FirestoreService.listCollection('departments');
    res.status(200).json({ items, total: items.length });
  }
}

const router = Router();
router.use(correlationMiddleware);
router.use(authMiddleware, rateGuardMiddleware);

router.get('/', DepartmentController.list);

export const departmentRouter = router;
