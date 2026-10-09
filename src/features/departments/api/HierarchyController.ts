import { Response, Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../iam/api/middlewares/correlationMiddleware';
import { FirestoreService } from '../../../platform/firestore/FirestoreService';

export class HierarchyController {
  public static async listSectors(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const items = await FirestoreService.listCollection('sectors');
    res.status(200).json({ items, total: items.length });
  }

  public static async listDepartments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const sectorId = typeof req.query.sectorId === 'string' ? req.query.sectorId : undefined;
    const items = await FirestoreService.listCollection('departments', sectorId ? { sectorId } : {});
    res.status(200).json({ items, total: items.length });
  }

  public static async listPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const filters: Record<string, string> = {};
    if (typeof req.query.departmentId === 'string') filters.departmentId = req.query.departmentId;
    if (typeof req.query.sectorId === 'string') filters.sectorId = req.query.sectorId;
    const items = await FirestoreService.listCollection('posts', filters);
    res.status(200).json({ items, total: items.length });
  }

  public static async listJurisdictions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
    const items = await FirestoreService.listCollection('jurisdictions', departmentId ? { departmentId } : {});
    res.status(200).json({ items, total: items.length });
  }
}

const router = Router();
router.use(correlationMiddleware);
router.use(authMiddleware);
router.get('/sectors', HierarchyController.listSectors);
router.get('/departments', HierarchyController.listDepartments);
router.get('/posts', HierarchyController.listPosts);
router.get('/jurisdictions', HierarchyController.listJurisdictions);

export const hierarchyRouter = router;
