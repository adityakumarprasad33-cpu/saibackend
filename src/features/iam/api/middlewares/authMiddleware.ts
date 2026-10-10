/**
 * IAM Authentication Middleware
 *
 * Extracts and verifies Bearer ID tokens and attaches user context.
 * All environments require a valid Firebase ID token.
 */

import { Response, NextFunction } from 'express';
import { CorrelatedRequest } from './correlationMiddleware';
import { FirebaseAuthAdapter } from '../../infrastructure/providers/FirebaseAuthAdapter';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { isPermissionId } from '../../../../platform/authorization/PermissionCatalog';

const STAFF_ROLES = new Set(['governmentofficial', 'nodalofficer', 'departmentadmin', 'superadmin']);

export interface AuthenticatedRequest extends CorrelatedRequest {
  user?: {
    uid: string;
    email: string;
    roleId: string;
    departmentId?: string | undefined;
    sectorId?: string | undefined;
    jurisdictionIds?: string[] | undefined;
    permissions?: string[] | undefined;
    employeeId?: string | undefined;
  };
}

const authProvider = new FirebaseAuthAdapter();

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 'Unauthorized',
      message: 'Missing or malformed Authorization Bearer header',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await authProvider.verifyIdToken(token || '');
    const accountStatus = decoded.claims.accountStatus;
    if (accountStatus && accountStatus !== 'Active') {
      res.status(403).json({
        code: 'AccountInactive',
        message: 'This account is not active.',
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
      });
      return;
    }
    const tokenRole = typeof decoded.claims.roleId === 'string'
      ? decoded.claims.roleId
      : typeof decoded.claims.role === 'string' ? decoded.claims.role : 'Citizen';
    const normalizedTokenRole = tokenRole.toLowerCase();
    if (normalizedTokenRole === 'citizen') {
      try {
        const profile = await FirestoreService.getUserProfile(decoded.uid);
        const profileStatus = profile?.accountStatus ?? profile?.accountState;
        if (profileStatus !== undefined && profileStatus !== 'Active') {
          res.status(403).json({ code: 'AccountInactive', message: 'This account is not active.' });
          return;
        }
      } catch {
        res.status(503).json({ code: 'IdentityStoreUnavailable', message: 'Current account authorization could not be verified.' });
        return;
      }
      req.user = { uid: decoded.uid, email: decoded.email || '', roleId: 'Citizen' };
      next();
      return;
    }
    if (!STAFF_ROLES.has(normalizedTokenRole)) {
      res.status(403).json({ code: 'UnsupportedRole', message: 'This account role is not supported.' });
      return;
    }

    // Resolve privileged identity and scope from current backend state on every request;
    // Firebase claims alone may be stale after employee transfer or deactivation.
    let employee: Record<string, unknown> | null;
    try {
      employee = await FirestoreService.getGovernmentEmployeeForUid(decoded.uid);
    } catch {
      res.status(503).json({ code: 'IdentityStoreUnavailable', message: 'Current employee authorization could not be verified.' });
      return;
    }
    const rawPermissions = Array.isArray(employee?.permissions) ? employee.permissions : [];
    if (rawPermissions.some(permission => !isPermissionId(permission))) {
      res.status(403).json({ code: 'EmployeeAccessDenied', message: 'Employee permissions contain an unsupported identifier.' });
      return;
    }
    const permissions = rawPermissions.filter(isPermissionId);
    const employeeRole = typeof employee?.primaryRole === 'string' ? employee.primaryRole : '';
    const jurisdictionIds = Array.isArray(employee?.jurisdictionIds)
      ? employee.jurisdictionIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const tokenDepartmentId = typeof decoded.claims.departmentId === 'string' ? decoded.claims.departmentId : undefined;
    const tokenSectorId = typeof decoded.claims.sectorId === 'string' ? decoded.claims.sectorId : undefined;
    const identityMatches = employee?.employeeId === decoded.uid && employee.authProviderUid === decoded.uid;
    const scopeMatches = (!tokenDepartmentId || tokenDepartmentId === employee?.departmentId) &&
      (!tokenSectorId || tokenSectorId === employee?.sectorId) &&
      (!Array.isArray(decoded.claims.jurisdictionIds) ||
        (decoded.claims.jurisdictionIds.length === jurisdictionIds.length &&
          decoded.claims.jurisdictionIds.every((id: unknown) => typeof id === 'string' && jurisdictionIds.includes(id))));
    const explicitGlobalGrant = permissions.includes('grievance.cross_scope');
    const validScope = normalizedTokenRole === 'superadmin' && explicitGlobalGrant
      ? true
      : typeof employee?.departmentId === 'string' && employee.departmentId.length > 0 &&
        typeof employee?.sectorId === 'string' && employee.sectorId.length > 0 &&
        jurisdictionIds.length > 0 && jurisdictionIds.length <= 30;
    if (!employee || !identityMatches || employee.accountStatus !== 'Active' ||
        employee.identityVerificationStatus !== 'Verified' ||
        employeeRole.toLowerCase() !== normalizedTokenRole || !scopeMatches || !validScope ||
        (accountStatus !== undefined && accountStatus !== 'Active')) {
        res.status(403).json({ code: 'EmployeeAccessDenied', message: 'Current employee must have active status, verified identity, and a consistent authoritative scope.' });
      return;
    }
    if (!(normalizedTokenRole === 'superadmin' && explicitGlobalGrant)) {
      let authoritativeScopeExists = false;
      try {
        authoritativeScopeExists = await FirestoreService.validateGovernmentEmployeeScope(employee);
      } catch {
        res.status(503).json({ code: 'IdentityStoreUnavailable', message: 'Current employee scope could not be verified.' });
        return;
      }
      if (!authoritativeScopeExists) {
        res.status(403).json({ code: 'EmployeeAccessDenied', message: 'Employee department or jurisdiction scope is not authoritative.' });
        return;
      }
    }
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      roleId: employeeRole,
      departmentId: typeof employee.departmentId === 'string' ? employee.departmentId : undefined,
      sectorId: typeof employee.sectorId === 'string' ? employee.sectorId : undefined,
      jurisdictionIds,
      permissions,
      employeeId: decoded.uid,
    };
    next();
  } catch (err) {
    res.status(401).json({
      code: 'InvalidToken',
      message: 'ID token verification failed or expired',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }
};
