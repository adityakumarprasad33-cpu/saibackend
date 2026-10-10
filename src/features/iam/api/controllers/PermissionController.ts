import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { isPermissionId, PermissionId } from '../../../../platform/authorization/PermissionCatalog';
import { PERMISSION_CATALOG } from '../../../../platform/authorization/PermissionCatalog';
import { PinoSecurityAuditLogger } from '../../infrastructure/logging/PinoSecurityAuditLogger';

function isSuperAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.roleId.toLowerCase() === 'superadmin';
}

function canManageTarget(req: AuthenticatedRequest, employee: Record<string, unknown>): boolean {
  const targetJurisdictions = employee.jurisdictionIds;
  const actorJurisdictions = req.user?.jurisdictionIds || [];
  const inScope = employee.departmentId === req.user?.departmentId &&
    Array.isArray(targetJurisdictions) && targetJurisdictions.length > 0 &&
    targetJurisdictions.every(id => typeof id === 'string' && actorJurisdictions.includes(id));
  if (inScope) return true;
  return isSuperAdmin(req) && req.user?.permissions?.includes('grievance.cross_scope') === true &&
    req.user.permissions.includes('iam.employee.cross_scope');
}

export class PermissionController {
  public static async catalog(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(200).json({ items: PERMISSION_CATALOG.map(id => ({
      id,
      grantableByCaller: req.user?.permissions?.includes(id) === true,
    })) });
  }

  public static async getEmployeePermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.permissions?.some(id => id === 'iam.permissions.grant' || id === 'iam.permissions.revoke')) {
      res.status(403).json({ code: 'PermissionDenied', message: 'Permission administration is not granted.' });
      return;
    }
    const employeeId = String(req.params.id || '');
    if (employeeId === req.user?.uid) {
      res.status(400).json({ code: 'SelfChangeDenied', message: 'The requesting account cannot administer its own grants.' });
      return;
    }
    const employee = await FirestoreService.getGovernmentEmployee(employeeId);
    if (!employee || !canManageTarget(req, employee)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    const permissions = Array.isArray(employee.permissions) ? employee.permissions : [];
    if (permissions.some(id => !isPermissionId(id))) {
      res.status(409).json({ code: 'PermissionDataInvalid', message: 'This employee has unsupported permission data and needs administrator review.' });
      return;
    }
    res.status(200).json({ employeeId, permissions, permissionVersion: Number(employee.permissionVersion || 0) });
  }

  public static async auditHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.permissions?.some(id => id === 'iam.permissions.grant' || id === 'iam.permissions.revoke')) {
      res.status(403).json({ code: 'PermissionDenied', message: 'Permission administration is not granted.' });
      return;
    }
    const employeeId = String(req.params.id || '');
    const employee = await FirestoreService.getGovernmentEmployee(employeeId);
    if (!employee || !canManageTarget(req, employee)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ code: 'InvalidLimit', message: 'limit must be from 1 to 100.' });
      return;
    }
    const items = await FirestoreService.listEmployeeAuditLogs(employeeId, limit);
    res.status(200).json({ employeeId, items });
  }

  public static async change(req: AuthenticatedRequest, res: Response, action: 'GRANT' | 'REVOKE'): Promise<void> {
    const targetId = String(req.params.id || '');
    const body = req.body as Record<string, unknown>;
    const permissionIds = body.permissionIds;
    const reason = body.reason;
    if (!targetId || targetId === req.user?.uid) {
      res.status(400).json({ code: 'SelfChangeDenied', message: 'Permissions cannot be changed on the requesting account.' });
      return;
    }
    if (!Array.isArray(permissionIds) || permissionIds.length < 1 || permissionIds.length > 10 ||
        permissionIds.some(id => !isPermissionId(id)) || new Set(permissionIds).size !== permissionIds.length ||
        typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      res.status(400).json({ code: 'InvalidPermissionChange', message: 'Provide 1-10 known permission IDs and a reason of 8-500 characters.' });
      return;
    }
    const employee = await FirestoreService.getGovernmentEmployee(targetId);
    if (!employee || !canManageTarget(req, employee)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    const requested = permissionIds as PermissionId[];
    const actorPermissions = new Set(req.user?.permissions || []);
    if (requested.some(permission => !actorPermissions.has(permission))) {
      res.status(403).json({ code: 'GrantExceedsAuthority', message: 'A grantor cannot grant or revoke permissions they do not hold.' });
      return;
    }
    const sensitive = requested.some(permission =>
      permission === 'grievance.cross_scope' || permission === 'iam.employee.cross_scope');
    if (sensitive && (!isSuperAdmin(req) || !actorPermissions.has('grievance.cross_scope'))) {
      res.status(403).json({ code: 'SensitiveGrantDenied', message: 'Cross-scope permissions require an explicitly authorized SuperAdmin.' });
      return;
    }
    if (sensitive && String(employee.primaryRole).toLowerCase() !== 'superadmin') {
      res.status(400).json({ code: 'InvalidPermissionTarget', message: 'Cross-scope permissions may only be assigned to a SuperAdmin account.' });
      return;
    }

    const result = await FirestoreService.updateEmployeePermissions(
      targetId, req.user!.uid, action, requested, reason.trim(),
    );
    if (!result) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'PermissionChange',
      userId: req.user!.uid,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-permissions-${Date.now()}`,
      details: { action, targetEmployeeId: targetId, permissionIds: requested, permissionVersion: result.permissionVersion },
    });
    res.status(200).json({ employeeId: targetId, permissions: result.permissions, permissionVersion: result.permissionVersion });
  }
}
