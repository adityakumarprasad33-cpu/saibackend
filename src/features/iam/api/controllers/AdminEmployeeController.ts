/**
 * Admin Government Employee Provisioning & IAM Controller
 *
 * Implements admin features:
 * - Provisioning new Government Employees (Sector -> Department -> Post -> Jurisdiction -> Role)
 * - Listing & searching employees
 * - Updating status (Suspend, Disable, Reactivate)
 * - Employee department transfer with assignment history
 * - Force session logout
 * - Security Audit trail
 */

import { Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { PinoSecurityAuditLogger } from '../../infrastructure/logging/PinoSecurityAuditLogger';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';

export class AdminEmployeeController {
  private static canManage(req: AuthenticatedRequest, employee: Record<string, unknown>): boolean {
    if ((req.user?.roleId || '').toLowerCase() === 'superadmin') return true;
    return Boolean(req.user?.departmentId && employee.departmentId === req.user.departmentId);
  }

  /**
   * Provisions a new Government Employee.
   * Admin-only. Server-side validation of Sector, Department, Post, Jurisdiction, and Role.
   */
  public static async provisionEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const {
      fullName,
      phoneNumber,
      email,
      employeeCode,
      sectorId,
      departmentId,
      departmentName,
      postId,
      postName,
      jurisdictionIds,
      role,
      accountStatus,
      credentialMethod,
    } = req.body;

    if (!fullName || !employeeCode || !sectorId || !departmentId || !postId || !email) {
      res.status(400).json({
        code: 'InvalidInput',
        message: 'fullName, email, employeeCode, sectorId, departmentId, and postId are required.',
      });
      return;
    }

    const requestingUserRole = (req.user?.roleId || '').toLowerCase();
    const primaryRole = String(role || 'GovernmentOfficial');
    if (!['governmentofficial', 'nodalofficer', 'departmentadmin'].includes(primaryRole.toLowerCase())) {
      res.status(400).json({ code: 'InvalidRole', message: 'The requested employee role is not permitted.' });
      return;
    }
    if (primaryRole.toLowerCase() === 'departmentadmin' && requestingUserRole !== 'superadmin') {
      res.status(403).json({
        code: 'Forbidden',
        message: 'Only a SuperAdmin can provision a DepartmentAdmin account.',
      });
      return;
    }
    if (requestingUserRole !== 'superadmin' &&
        (departmentId !== req.user?.departmentId || sectorId !== req.user?.sectorId)) {
      res.status(403).json({ code: 'Forbidden', message: 'Employee provisioning is outside your department scope.' });
      return;
    }

    const auth = getAuth();
    const authUser = await auth.createUser({
      email: String(email).trim().toLowerCase(),
      displayName: String(fullName).trim(),
      ...(phoneNumber ? { phoneNumber: String(phoneNumber) } : {}),
      disabled: false,
    });
    const now = new Date().toISOString();
    const newEmployee: Record<string, unknown> = {
      employeeId: authUser.uid,
      authProviderUid: authUser.uid,
      employeeCode: String(employeeCode).trim(),
      fullName: String(fullName).trim(),
      phoneNumber: phoneNumber || '',
      email: authUser.email,
      sectorId,
      departmentId,
      departmentName: departmentName || departmentId,
      postId,
      postName: postName || postId,
      primaryRole,
      jurisdictionIds: Array.isArray(jurisdictionIds) ? jurisdictionIds : [],
      accountStatus: 'PendingActivation',
      employmentStatus: 'FullTime',
      identityVerificationStatus: 'Pending',
      credentialMethod: credentialMethod || 'PasswordResetLink',
      createdAt: now,
      updatedAt: now,
      createdBy: req.user!.uid,
      updatedBy: req.user!.uid,
    };

    try {
      await auth.setCustomUserClaims(authUser.uid, {
        roleId: primaryRole,
        accountStatus: 'PendingActivation',
        sectorId,
        departmentId,
        postId,
        jurisdictionIds: newEmployee.jurisdictionIds,
      });
      await FirestoreService.saveGovernmentEmployee(newEmployee);
    } catch (error) {
      await auth.deleteUser(authUser.uid).catch(() => undefined);
      throw error;
    }
    const activationLink = await auth.generatePasswordResetLink(authUser.email!);
    await FirestoreService.addAdminAuditLog({
      event: 'GOVERNMENT_EMPLOYEE_CREATED',
      userId: req.user!.uid,
      employeeId: authUser.uid,
      employeeCode,
      departmentId,
      role: primaryRole,
    });

    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'GOVERNMENT_EMPLOYEE_CREATED',
      userId: req.user!.uid,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-emp-${Date.now()}`,
      details: { employeeId: authUser.uid, employeeCode, departmentId, role: newEmployee.primaryRole },
    });

    res.status(201).json({
      message: 'Government employee provisioned successfully',
      employee: newEmployee,
      activationLink,
    });
  }

  /**
   * Lists provisioned government employees with search and department filtering.
   */
  public static async listEmployees(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { departmentId, sectorId, search } = req.query;
    const isSuperAdmin = (req.user?.roleId || '').toLowerCase() === 'superadmin';
    if (!isSuperAdmin && !req.user?.departmentId) {
      res.status(403).json({ code: 'Forbidden', message: 'No department scope is assigned to this account.' });
      return;
    }
    const employees = await FirestoreService.listGovernmentEmployees({
      departmentId: isSuperAdmin
        ? (departmentId ? String(departmentId) : undefined)
        : req.user!.departmentId,
      sectorId: isSuperAdmin ? (sectorId ? String(sectorId) : undefined) : req.user!.sectorId,
      search: search ? String(search) : undefined,
    });

    res.status(200).json({
      items: employees,
      total: employees.length,
    });
  }

  /**
   * Updates employee account status (Suspend, Disable, Reactivate).
   */
  public static async updateEmployeeStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const { status } = req.body;
    if (!['Active', 'Suspended', 'Disabled'].includes(status)) {
      res.status(400).json({ code: 'InvalidStatus', message: 'Status must be Active, Suspended, or Disabled.' });
      return;
    }
    const emp = await FirestoreService.getGovernmentEmployee(id);
    if (!emp) {
      res.status(404).json({ code: 'NotFound', message: `Employee with ID '${id}' not found.` });
      return;
    }
    if (!AdminEmployeeController.canManage(req, emp)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    const authUid = String(emp.authProviderUid || id);
    const auth = getAuth();
    await auth.updateUser(authUid, { disabled: status !== 'Active' });
    const authUser = await auth.getUser(authUid);
    await auth.setCustomUserClaims(authUid, {
      ...authUser.customClaims,
      roleId: emp.primaryRole,
      accountStatus: status,
    });
    await auth.revokeRefreshTokens(authUid);
    await FirestoreService.updateGovernmentEmployee(id, {
      accountStatus: status,
      updatedBy: req.user!.uid,
    });

    PinoSecurityAuditLogger.logSecurityEvent({
      event: `EMPLOYEE_${String(status).toUpperCase()}`,
      userId: req.user!.uid,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-status-${Date.now()}`,
      details: { employeeId: id, newStatus: status },
    });

    await FirestoreService.addAdminAuditLog({
      event: `EMPLOYEE_${String(status).toUpperCase()}`,
      userId: req.user!.uid,
      employeeId: id,
    });
    res.status(200).json({ message: `Employee status updated to '${status}'`, employee: { ...emp, accountStatus: status } });
  }

  /**
   * Executes employee transfer with assignment history tracking.
   */
  public static async transferEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const { newDepartmentId, newPostId, newJurisdictionIds, reason } = req.body;

    const emp = await FirestoreService.getGovernmentEmployee(id);
    if (!emp) {
      res.status(404).json({ code: 'NotFound', message: `Employee with ID '${id}' not found.` });
      return;
    }
    if (!AdminEmployeeController.canManage(req, emp)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    if ((req.user?.roleId || '').toLowerCase() !== 'superadmin' &&
        newDepartmentId && newDepartmentId !== req.user?.departmentId) {
      res.status(403).json({ code: 'Forbidden', message: 'Transfers outside your department require a SuperAdmin.' });
      return;
    }

    const nextDepartmentId = newDepartmentId || emp.departmentId;
    const nextPostId = newPostId || emp.postId;
    const nextJurisdictionIds = Array.isArray(newJurisdictionIds) ? newJurisdictionIds : emp.jurisdictionIds;
    const authUid = String(emp.authProviderUid || id);
    const auth = getAuth();
    const authUser = await auth.getUser(authUid);
    await auth.setCustomUserClaims(authUid, {
      ...authUser.customClaims,
      departmentId: nextDepartmentId,
      postId: nextPostId,
      jurisdictionIds: nextJurisdictionIds,
    });
    const changes = {
      departmentId: nextDepartmentId,
      postId: nextPostId,
      jurisdictionIds: nextJurisdictionIds,
      updatedBy: req.user!.uid,
    };
    await FirestoreService.updateGovernmentEmployee(id, changes);
    const previousDept = emp.departmentId;

    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'EMPLOYEE_TRANSFERRED',
      userId: req.user!.uid,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-transfer-${Date.now()}`,
      details: { employeeId: id, previousDept, newDept: nextDepartmentId, reason },
    });
    await FirestoreService.addAdminAuditLog({
      event: 'EMPLOYEE_TRANSFERRED',
      userId: req.user!.uid,
      employeeId: id,
      previousDepartmentId: previousDept,
      newDepartmentId: nextDepartmentId,
      reason,
    });

    res.status(200).json({ message: 'Employee transferred successfully', employee: { ...emp, ...changes } });
  }

  /**
   * Forces revocation of employee session tokens across all devices.
   */
  public static async forceLogout(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { employeeId } = req.body;
    if (typeof employeeId !== 'string' || !employeeId) {
      res.status(400).json({ code: 'InvalidInput', message: 'employeeId is required.' });
      return;
    }
    const employee = await FirestoreService.getGovernmentEmployee(employeeId);
    if (!employee) {
      res.status(404).json({ code: 'NotFound', message: `Employee with ID '${employeeId}' not found.` });
      return;
    }
    if (!AdminEmployeeController.canManage(req, employee)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    await getAuth().revokeRefreshTokens(String(employee.authProviderUid || employeeId));

    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'FORCED_LOGOUT',
      userId: req.user!.uid,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-logout-${Date.now()}`,
      details: { targetEmployeeId: employeeId },
    });

    await FirestoreService.addAdminAuditLog({
      event: 'FORCED_LOGOUT',
      userId: req.user!.uid,
      employeeId,
    });
    res.status(200).json({ message: `Refresh tokens for employee '${employeeId}' revoked.` });
  }

  /**
   * Queries security audit history logs.
   */
  public static async getAuditLogs(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const logs = await FirestoreService.listAdminAuditLogs();
    res.status(200).json({
      items: logs,
      total: logs.length,
    });
  }
}
