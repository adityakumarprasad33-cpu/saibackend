/**
 * Centralized Policy & Authorization Engine
 *
 * Evaluates subject permissions against resources, actions, and contextual attributes (ABAC Ready).
 */

import { ApplicationUser } from '../entities/ApplicationUser';
import { UserRole } from '../entities/UserRole';

export interface EvaluationContext {
  resourceId?: string;
  departmentId?: string;
  location?: string;
  currentTime?: Date;
  ipAddress?: string;
  customAttributes?: Record<string, unknown>;
}

export interface EvaluationRequest {
  user: ApplicationUser;
  role: UserRole;
  permissionId: string;
  context?: EvaluationContext;
}

export class PolicyEngine {
  /**
   * Evaluates if a user with a given role and context possesses permission.
   */
  public static evaluate(request: EvaluationRequest): boolean {
    const { user, role, permissionId, context } = request;

    // 1. Account state check
    if (!user.isActive() || user.isLocked()) {
      return false;
    }

    // 2. SuperAdmin bypass
    if (role.roleId === 'super_admin') {
      return true;
    }

    // 3. Permission check against Role Permission Groups
    const hasRolePermission = role.hasPermission(permissionId);
    if (!hasRolePermission) {
      return false;
    }

    // 4. ABAC Contextual Attribute Check (e.g. Department isolation)
    if (context?.departmentId && user.toJSON().departmentId) {
      if (user.toJSON().departmentId !== context.departmentId && role.roleId !== 'super_admin') {
        return false;
      }
    }

    return true;
  }
}
