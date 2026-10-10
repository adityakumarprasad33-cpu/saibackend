import { Response, Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../iam/api/middlewares/correlationMiddleware';
import { requirePermission, requireRole } from '../../iam/api/middlewares/rbacMiddleware';
import { FirestoreService } from '../../../platform/firestore/FirestoreService';

export class HierarchyController {
  private static hasGlobalHierarchyScope(req: AuthenticatedRequest): boolean {
    return req.user?.roleId.toLowerCase() === 'superadmin' &&
      req.user.permissions?.includes('grievance.cross_scope') === true &&
      req.user.permissions.includes('iam.employee.cross_scope');
  }

  private static withinEmployeeScope(req: AuthenticatedRequest, row: Record<string, unknown>): boolean {
    if (HierarchyController.hasGlobalHierarchyScope(req)) return true;
    if (row.sectorId !== undefined && row.sectorId !== req.user?.sectorId) return false;
    if (row.departmentId !== undefined && row.departmentId !== req.user?.departmentId) return false;
    if (row.jurisdictionId !== undefined && !req.user?.jurisdictionIds?.includes(String(row.jurisdictionId))) return false;
    if (row.id && row.departmentId !== undefined && row.stateCode !== undefined &&
        !req.user?.jurisdictionIds?.includes(String(row.id))) return false;
    return Boolean(req.user?.departmentId && req.user.sectorId && req.user.jurisdictionIds?.length);
  }

  public static async listSectors(req: AuthenticatedRequest, res: Response): Promise<void> {
    const items = (await FirestoreService.listCollection('sectors'))
      .filter(row => (HierarchyController.hasGlobalHierarchyScope(req) || row.sectorId === req.user?.sectorId) &&
        HierarchyController.withinEmployeeScope(req, row) && row.status === 'Active');
    res.status(200).json({ items, total: items.length });
  }

  public static async listDepartments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const requestedSector = typeof req.query.sectorId === 'string' ? req.query.sectorId : req.user?.sectorId;
    const sectorId = HierarchyController.hasGlobalHierarchyScope(req) ? requestedSector : req.user?.sectorId;
    const items = (await FirestoreService.listCollection('departments', sectorId ? { sectorId } : {}))
      .filter(row => ((row.departmentId || row.id) === req.user?.departmentId || HierarchyController.hasGlobalHierarchyScope(req)) &&
        row.status === 'Active');
    res.status(200).json({ items, total: items.length });
  }

  public static async listPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const filters: Record<string, string> = {};
    const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : req.user?.departmentId;
    const sectorId = typeof req.query.sectorId === 'string' ? req.query.sectorId : req.user?.sectorId;
    if (!HierarchyController.hasGlobalHierarchyScope(req)) {
      filters.departmentId = req.user?.departmentId || '';
      filters.sectorId = req.user?.sectorId || '';
    } else {
      if (departmentId) filters.departmentId = departmentId;
      if (sectorId) filters.sectorId = sectorId;
    }
    const items = (await FirestoreService.listCollection('posts', filters))
      .filter(row => HierarchyController.withinEmployeeScope(req, row) && row.status === 'Active');
    res.status(200).json({ items, total: items.length });
  }

  public static async listJurisdictions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const requestedDepartment = typeof req.query.departmentId === 'string' ? req.query.departmentId : req.user?.departmentId;
    const departmentId = HierarchyController.hasGlobalHierarchyScope(req) ? requestedDepartment : req.user?.departmentId;
    const items = (await FirestoreService.listCollection('jurisdictions', departmentId ? { departmentId } : {}))
      .filter(row => HierarchyController.withinEmployeeScope(req, row) && row.status === 'Active');
    res.status(200).json({ items, total: items.length });
  }

  public static async listGrievanceCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.permissions?.some(id => id === 'grievance.routing.manage' || id === 'grievance.triage.read')) {
      res.status(403).json({ code: 'PermissionDenied', message: 'Canonical grievance categories are not available in your scope.' });
      return;
    }
    const items = await FirestoreService.listActiveGrievanceCategories();
    res.status(200).json({ items, total: items.length });
  }

  public static async createRoutingMapping(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { stateCode, districtName, categoryId, departmentId, jurisdictionId, priority, slaHours, reason } = req.body || {};
    if (typeof stateCode !== 'string' || !/^[A-Za-z]{2}$/.test(stateCode) ||
        typeof districtName !== 'string' || !districtName.trim() || districtName.trim().length > 120 ||
        typeof categoryId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(categoryId) ||
        typeof departmentId !== 'string' || typeof jurisdictionId !== 'string' ||
        !['Low', 'Medium', 'High', 'Critical'].includes(priority) || !Number.isInteger(slaHours) ||
        slaHours < 1 || slaHours > 8760 || typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      res.status(400).json({ code: 'InvalidRoutingMapping', message: 'Provide a category ID, state/district matching canonical records, active organization IDs, priority/SLA, and an 8-500 character approval reason.' });
      return;
    }
    const inScope = departmentId === req.user?.departmentId && req.user?.jurisdictionIds?.includes(jurisdictionId);
    const hasCrossScope = req.user?.roleId.toLowerCase() === 'superadmin' &&
      req.user.permissions?.includes('grievance.cross_scope') === true &&
      req.user.permissions.includes('iam.employee.cross_scope');
    if (!inScope && !hasCrossScope) {
      res.status(403).json({ code: 'RoutingScopeDenied', message: 'Routing mappings may only be approved inside your verified scope.' });
      return;
    }
    try {
      const mapping = await FirestoreService.saveGrievanceRoutingMapping({
        stateCode, districtName, districtKey: districtName.trim().toLowerCase().replace(/\s+/g, ' '),
        categoryId, departmentId, jurisdictionId, priority, slaHours, reason,
      }, req.user!.uid);
      res.status(201).json({ ...mapping, status: 'Active' });
    } catch (error) {
      res.status(400).json({ code: 'InvalidRoutingMapping', message: error instanceof Error ? error.message : 'Routing mapping could not be validated.' });
    }
  }
}

const router = Router();
router.use(correlationMiddleware);
router.use(authMiddleware);
router.get('/sectors', requireRole('DepartmentAdmin', 'SuperAdmin'), requirePermission('iam.employee.provision'), HierarchyController.listSectors);
router.get('/departments', requireRole('DepartmentAdmin', 'SuperAdmin'), requirePermission('iam.employee.provision'), HierarchyController.listDepartments);
router.get('/posts', requireRole('DepartmentAdmin', 'SuperAdmin'), requirePermission('iam.employee.provision'), HierarchyController.listPosts);
router.get('/jurisdictions', requireRole('DepartmentAdmin', 'SuperAdmin'), requirePermission('iam.employee.provision'), HierarchyController.listJurisdictions);
router.get('/grievance-categories', requireRole('NodalOfficer', 'DepartmentAdmin', 'SuperAdmin'), HierarchyController.listGrievanceCategories);
router.post('/grievance-routing-mappings', requireRole('DepartmentAdmin', 'SuperAdmin'), requirePermission('grievance.routing.manage'), HierarchyController.createRoutingMapping);

export const hierarchyRouter = router;
