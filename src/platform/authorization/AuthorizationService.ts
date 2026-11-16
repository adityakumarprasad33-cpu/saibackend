import { AuthenticatedRequest } from '../../features/iam/api/middlewares/authMiddleware';
import { isPermissionId, PermissionId } from './PermissionCatalog';

export type AuthorizationAction =
  | 'grievance.read'
  | 'grievance.list'
  | 'grievance.update'
  | 'timeline.read'
  | 'comment.citizen.create'
  | 'comment.internal.create'
  | 'attachment.read'
  | 'attachment.upload'
  | 'feedback.create'
  | 'case.accept'
  | 'case.assign'
  | 'case.reassign'
  | 'case.investigate'
  | 'case.resolve'
  | 'case.close'
  | 'case.metrics.read';

type GrievanceRecord = Record<string, any>;

const STAFF_ROLES = new Set(['governmentofficial', 'nodalofficer', 'departmentadmin', 'superadmin']);

function permissionsFor(req: AuthenticatedRequest): Set<string> {
  return new Set(req.user?.permissions ?? []);
}

function isCitizenOwner(req: AuthenticatedRequest, grievance: GrievanceRecord): boolean {
  const canonicalPresent = Object.prototype.hasOwnProperty.call(grievance, 'citizenUserId');
  const legacyPresent = grievance.citizen && Object.prototype.hasOwnProperty.call(grievance.citizen, 'uid');
  if ((canonicalPresent && (typeof grievance.citizenUserId !== 'string' || !grievance.citizenUserId)) ||
      (legacyPresent && (typeof grievance.citizen.uid !== 'string' || !grievance.citizen.uid))) return false;
  const canonicalOwner = canonicalPresent ? grievance.citizenUserId as string : undefined;
  const legacyOwner = legacyPresent ? grievance.citizen.uid as string : undefined;
  if (canonicalOwner && legacyOwner && canonicalOwner !== legacyOwner) return false;
  const owner = canonicalOwner ?? legacyOwner;
  return Boolean(owner && owner === req.user?.uid);
}

function hasCanonicalStaffScope(req: AuthenticatedRequest, grievance: GrievanceRecord): boolean {
  const user = req.user;
  const departmentId = grievance.departmentId;
  const jurisdictionId = grievance.jurisdictionId;
  return Boolean(
    user?.departmentId && user.departmentId === departmentId &&
    typeof jurisdictionId === 'string' && jurisdictionId.length > 0 &&
    user.jurisdictionIds?.includes(jurisdictionId),
  );
}

/** One policy boundary for grievance records and their protected descendants. */
export class AuthorizationService {
  public static hasPermission(req: AuthenticatedRequest, permission: string): boolean {
    return isPermissionId(permission) && Boolean(req.user?.permissions?.includes(permission as PermissionId));
  }

  public static allows(
    req: AuthenticatedRequest,
    action: AuthorizationAction,
    grievance?: GrievanceRecord,
  ): boolean {
    const user = req.user;
    if (!user?.uid) return false;
    const role = user.roleId.toLowerCase();
    const permissions = permissionsFor(req);

    if (role === 'citizen') {
      if (action === 'grievance.list') return true;
      if (!grievance || !isCitizenOwner(req, grievance)) return false;
      if (['grievance.read', 'timeline.read', 'attachment.read', 'attachment.upload', 'comment.citizen.create'].includes(action)) return true;
      return action === 'feedback.create' && ['Resolved', 'Closed'].includes(String(grievance.state ?? grievance.status));
    }

    if (!STAFF_ROLES.has(role)) return false;
    if (action === 'feedback.create') return false;

    // A SuperAdmin role alone is not a global grant. Each cross-scope operation
    // needs an explicit server-managed permission on the current employee record.
    if (role === 'superadmin') {
      if (!permissions.has('grievance.cross_scope')) return false;
      return permissions.has(action);
    }

    if (action === 'grievance.list' || action === 'case.metrics.read') {
      if (!user?.departmentId || !user.jurisdictionIds?.length) return false;
      return true;
    }
    if (!grievance || !hasCanonicalStaffScope(req, grievance)) return false;
    if (['grievance.read', 'grievance.list', 'timeline.read', 'attachment.read', 'comment.citizen.create'].includes(action)) return true;
    return permissions.has(action);
  }

  public static canCreateGrievance(req: AuthenticatedRequest): boolean {
    return Boolean(req.user?.uid && req.user.roleId.toLowerCase() === 'citizen');
  }
}
