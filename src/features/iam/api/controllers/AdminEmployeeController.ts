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
import { randomBytes } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { PinoSecurityAuditLogger } from '../../infrastructure/logging/PinoSecurityAuditLogger';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { EmployeeInvitationMailer } from '../../infrastructure/EmployeeInvitationMailer';

export class AdminEmployeeController {
  private static canManage(req: AuthenticatedRequest, employee: Record<string, unknown>): boolean {
    const jurisdictions = employee.jurisdictionIds;
    const scoped = Boolean(req.user?.departmentId && employee.departmentId === req.user.departmentId &&
      Array.isArray(jurisdictions) && jurisdictions.length > 0 &&
      jurisdictions.every(id => typeof id === 'string' && req.user?.jurisdictionIds?.includes(id)));
    if (scoped) return true;
    return (req.user?.roleId || '').toLowerCase() === 'superadmin' &&
      req.user?.permissions?.includes('grievance.cross_scope') === true &&
      req.user.permissions.includes('iam.employee.cross_scope');
  }

  private static employeeResponse(employee: Record<string, unknown>): Record<string, unknown> {
    const allowed = [
      'employeeId', 'employeeCode', 'fullName', 'email', 'phoneNumber', 'sectorId', 'departmentId',
      'departmentName', 'postId', 'postName', 'primaryRole', 'jurisdictionIds', 'accountStatus',
      'identityVerificationStatus', 'employmentStatus', 'createdAt', 'updatedAt',
    ];
    return Object.fromEntries(allowed.filter(key => employee[key] !== undefined).map(key => [key, employee[key]]));
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

    if (!Array.isArray(jurisdictionIds) || jurisdictionIds.length === 0 ||
        jurisdictionIds.some((id: unknown) => typeof id !== 'string' || !id.trim()) ||
        (requestingUserRole !== 'superadmin' &&
          jurisdictionIds.some((id: string) => !req.user?.jurisdictionIds?.includes(id)))) {
      res.status(403).json({ code: 'InvalidEmployeeScope', message: 'Choose only verified jurisdictions within your authorized scope.' });
      return;
    }
    if (requestingUserRole === 'superadmin' &&
        (departmentId !== req.user?.departmentId || jurisdictionIds.some((id: string) => !req.user?.jurisdictionIds?.includes(id))) &&
        (!req.user?.permissions?.includes('grievance.cross_scope') || !req.user.permissions.includes('iam.employee.cross_scope'))) {
      res.status(403).json({ code: 'CrossScopeDenied', message: 'Cross-scope provisioning requires explicit cross-scope permissions.' });
      return;
    }
    if (!await FirestoreService.validateEmployeeProvisioningScope(
      String(departmentId), String(sectorId), String(postId), jurisdictionIds as string[],
    )) {
      res.status(400).json({ code: 'InvalidEmployeeScope', message: 'Department, sector, post, and jurisdictions must exist and form an active hierarchy.' });
      return;
    }

    if (!EmployeeInvitationMailer.isAvailable()) {
      res.status(503).json({
        code: 'InvitationDeliveryUnavailable',
        message: 'Secure employee invitation delivery is not configured. No account was created.',
      });
      return;
    }

    const auth = getAuth();
    let authUid: string | undefined;
    let employeeSaved = false;
    try {
      const authUser = await auth.createUser({
        email: String(email).trim().toLowerCase(),
        displayName: String(fullName).trim(),
        ...(phoneNumber ? { phoneNumber: String(phoneNumber) } : {}),
        disabled: false,
      });
      authUid = authUser.uid;
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
      jurisdictionIds,
      permissions: [],
      permissionVersion: 0,
      accountStatus: 'PendingActivation',
      employmentStatus: 'FullTime',
      identityVerificationStatus: 'Unverified',
      createdAt: now,
      updatedAt: now,
      createdBy: req.user!.uid,
      updatedBy: req.user!.uid,
      };
      await auth.setCustomUserClaims(authUser.uid, {
        roleId: primaryRole,
        accountStatus: 'PendingActivation',
        sectorId,
        departmentId,
        postId,
        jurisdictionIds: newEmployee.jurisdictionIds,
      });
      await FirestoreService.saveGovernmentEmployee(newEmployee);
      employeeSaved = true;
      const invitationToken = randomBytes(32).toString('base64url');
      const invitationIssued = await FirestoreService.issueEmployeeInvitation(
        authUser.uid, invitationToken, req.user!.uid, 'iam.employee.provision',
      );
      if (!invitationIssued) throw new Error('Invitation eligibility changed during provisioning.');
      await EmployeeInvitationMailer.sendInvitation({
        recipient: authUser.email!,
        displayName: String(fullName).trim(),
        invitationUrl: EmployeeInvitationMailer.buildInvitationUrl(invitationToken),
      });
      await FirestoreService.addAdminAuditLog({
        event: 'GOVERNMENT_EMPLOYEE_INVITATION_SENT',
        userId: req.user!.uid,
        employeeId: authUser.uid,
        departmentId,
        role: primaryRole,
      });
      PinoSecurityAuditLogger.logSecurityEvent({
        event: 'GOVERNMENT_EMPLOYEE_INVITATION_SENT',
        userId: req.user!.uid,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        correlationId: req.correlationId,
        auditId: `audit-emp-${Date.now()}`,
        details: { employeeId: authUser.uid, departmentId, role: primaryRole },
      });

      res.status(201).json({
        message: 'Government employee account created and invitation sent to the registered work email.',
        employee: AdminEmployeeController.employeeResponse(newEmployee),
      });
    } catch {
      if (authUid) await FirestoreService.revokeEmployeeInvitation(authUid, req.user!.uid).catch(() => undefined);
      if (employeeSaved && authUid) await FirestoreService.deleteGovernmentEmployee(authUid).catch(() => undefined);
      if (authUid) await auth.deleteUser(authUid).catch(() => undefined);
      await FirestoreService.addAdminAuditLog({
        event: 'GOVERNMENT_EMPLOYEE_INVITATION_DELIVERY_FAILED',
        userId: req.user!.uid,
        ...(authUid ? { employeeId: authUid } : {}),
        failure: 'provision_or_delivery',
      }).catch(() => undefined);
      PinoSecurityAuditLogger.logSecurityEvent({
        event: 'GOVERNMENT_EMPLOYEE_INVITATION_FAILED',
        userId: req.user!.uid,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        correlationId: req.correlationId,
        auditId: `audit-emp-invite-failed-${Date.now()}`,
        details: { ...(authUid ? { employeeId: authUid } : {}), failure: 'delivery_or_provisioning' },
      });
      res.status(503).json({ code: 'InvitationUnavailable', message: 'Account setup could not be completed. Contact your administrator.' });
    }
  }

  /** Resend is deliberately generic; this endpoint never discloses account eligibility or its link. */
  public static async resendInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const employeeId = String(req.params.id || '');
    const generic = { message: 'If the account is eligible, an invitation will be delivered to its registered work email.' };
    let invitationIssued = false;
    try {
      const employee = await FirestoreService.getGovernmentEmployee(employeeId);
      if (employee && AdminEmployeeController.canManage(req, employee) &&
          employee.accountStatus === 'PendingActivation' && typeof employee.email === 'string' &&
          EmployeeInvitationMailer.isAvailable()) {
        const authUid = String(employee.authProviderUid || employeeId);
        const invitationToken = randomBytes(32).toString('base64url');
        invitationIssued = await FirestoreService.issueEmployeeInvitation(
          authUid, invitationToken, req.user!.uid, 'iam.employee.invite',
        );
        if (!invitationIssued) throw new Error('Invitation eligibility changed.');
        await EmployeeInvitationMailer.sendInvitation({
          recipient: employee.email,
          displayName: String(employee.fullName || 'Government employee'),
          invitationUrl: EmployeeInvitationMailer.buildInvitationUrl(invitationToken),
        });
        await FirestoreService.addAdminAuditLog({
          event: 'GOVERNMENT_EMPLOYEE_INVITATION_RESENT',
          userId: req.user!.uid,
          employeeId: authUid,
          departmentId: employee.departmentId,
        });
        PinoSecurityAuditLogger.logSecurityEvent({
          event: 'GOVERNMENT_EMPLOYEE_INVITATION_RESENT',
          userId: req.user!.uid,
          ipAddress: req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          correlationId: req.correlationId,
          auditId: `audit-emp-invite-resent-${Date.now()}`,
          details: { employeeId: authUid },
        });
      }
    } catch {
      PinoSecurityAuditLogger.logSecurityEvent({
        event: 'GOVERNMENT_EMPLOYEE_INVITATION_ATTEMPT',
        userId: req.user?.uid || 'unknown',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        correlationId: req.correlationId,
        auditId: `audit-emp-invite-attempt-${Date.now()}`,
        details: { employeeId, result: 'not_disclosed' },
      });
      if (invitationIssued) {
        await FirestoreService.revokeEmployeeInvitation(employeeId, req.user?.uid).catch(() => undefined);
        await FirestoreService.addAdminAuditLog({
          event: 'GOVERNMENT_EMPLOYEE_INVITATION_DELIVERY_FAILED',
          ...(req.user?.uid ? { userId: req.user.uid } : {}),
          employeeId,
        }).catch(() => undefined);
      }
    }
    res.status(202).json(generic);
  }

  public static async consumeInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const token = req.body?.token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      res.status(410).json({ code: 'InvitationUnavailable', message: 'This invitation is invalid, expired, or already used. Ask your administrator for a new invitation.' });
      return;
    }
    try {
      const consumed = await FirestoreService.consumeEmployeeInvitation(token);
      if (!consumed) {
        res.status(410).json({ code: 'InvitationUnavailable', message: 'This invitation is invalid, expired, or already used. Ask your administrator for a new invitation.' });
        return;
      }
      const link = await getAuth().generatePasswordResetLink(consumed.email);
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      res.status(303).setHeader('Location', link).end();
    } catch {
      res.status(503).json({ code: 'InvitationUnavailable', message: 'This invitation could not be processed. Ask your administrator to resend it.' });
    }
  }

  /**
   * Lists provisioned government employees with search and department filtering.
   */
  public static async listEmployees(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { departmentId, sectorId, search } = req.query;
    const isSuperAdmin = (req.user?.roleId || '').toLowerCase() === 'superadmin';
    const hasGlobalEmployeeScope = isSuperAdmin && req.user?.permissions?.includes('grievance.cross_scope') === true &&
      req.user.permissions.includes('iam.employee.cross_scope');
    if (!hasGlobalEmployeeScope && (!req.user?.departmentId || !req.user.jurisdictionIds?.length)) {
      res.status(403).json({ code: 'EmployeeScopeRequired', message: 'A verified department and jurisdiction scope is required.' });
      return;
    }
    const employees = await FirestoreService.listGovernmentEmployees({
      departmentId: hasGlobalEmployeeScope
        ? (departmentId ? String(departmentId) : undefined)
        : req.user!.departmentId,
      sectorId: hasGlobalEmployeeScope ? (sectorId ? String(sectorId) : undefined) : req.user!.sectorId,
      ...(!hasGlobalEmployeeScope ? { jurisdictionIds: req.user!.jurisdictionIds } : {}),
      search: search ? String(search) : undefined,
    });
    const visibleEmployees = employees
      .filter(employee => AdminEmployeeController.canManage(req, employee))
      .map(employee => AdminEmployeeController.employeeResponse(employee));
    res.status(200).json({
      items: visibleEmployees,
      total: visibleEmployees.length,
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
    if (status === 'Active' && emp.identityVerificationStatus !== 'Verified') {
      res.status(409).json({ code: 'IdentityNotVerified', message: 'Verify the employee identity before activating this account.' });
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
    res.status(200).json({ message: `Employee status updated to '${status}'`, employee: AdminEmployeeController.employeeResponse({ ...emp, accountStatus: status }) });
  }

  /**
   * Executes employee transfer with assignment history tracking.
   */
  public static async transferEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const { newDepartmentId, newPostId, newJurisdictionIds, reason } = req.body;
    if (typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      res.status(400).json({ code: 'InvalidTransfer', message: 'A transfer reason of 8-500 characters is required.' });
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
    if ((req.user?.roleId || '').toLowerCase() !== 'superadmin' &&
        newDepartmentId && newDepartmentId !== req.user?.departmentId) {
      res.status(403).json({ code: 'Forbidden', message: 'Transfers outside your department require a SuperAdmin.' });
      return;
    }

    const nextDepartmentId = newDepartmentId || emp.departmentId;
    const nextPostId = newPostId || emp.postId;
    const nextJurisdictionIds = newJurisdictionIds === undefined ? emp.jurisdictionIds : newJurisdictionIds;
    if (!Array.isArray(nextJurisdictionIds) || nextJurisdictionIds.length === 0 ||
        nextJurisdictionIds.some((scopeId: unknown) => typeof scopeId !== 'string' || !scopeId.trim()) ||
        (!req.user?.permissions?.includes('iam.employee.cross_scope') &&
          nextJurisdictionIds.some((scopeId: string) => !req.user?.jurisdictionIds?.includes(scopeId))) ||
        !await FirestoreService.validateEmployeeProvisioningScope(
          String(nextDepartmentId), String(emp.sectorId), String(nextPostId), nextJurisdictionIds,
        )) {
      res.status(400).json({ code: 'InvalidEmployeeScope', message: 'The new department, post, and jurisdictions must form a verified active scope within the grantor authority.' });
      return;
    }
    const inActorScope = nextDepartmentId === req.user?.departmentId &&
      nextJurisdictionIds.every((scopeId: string) => req.user?.jurisdictionIds?.includes(scopeId));
    if (!inActorScope && (req.user?.roleId.toLowerCase() !== 'superadmin' ||
        !req.user.permissions?.includes('grievance.cross_scope') ||
        !req.user.permissions.includes('iam.employee.cross_scope'))) {
      res.status(403).json({ code: 'CrossScopeDenied', message: 'Cross-department or cross-jurisdiction transfer requires explicit cross-scope permissions.' });
      return;
    }
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
      permissions: [],
      permissionVersion: Number(emp.permissionVersion || 0) + 1,
      updatedBy: req.user!.uid,
    };
    await FirestoreService.updateGovernmentEmployee(id, changes);
    await auth.revokeRefreshTokens(authUid);
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
      revokedPermissionIds: Array.isArray(emp.permissions) ? emp.permissions : [],
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

  public static async verifyEmployeeIdentity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const employeeId = String(req.params.id || '');
    const reason = req.body?.reason;
    const evidenceReference = req.body?.evidenceReference;
    if (!employeeId || employeeId === req.user?.uid) {
      res.status(400).json({ code: 'SelfVerificationDenied', message: 'An employee cannot verify their own identity.' });
      return;
    }
    if (typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      res.status(400).json({ code: 'InvalidVerification', message: 'A verification reason of 8-500 characters is required.' });
      return;
    }
    if (typeof evidenceReference !== 'string' || !/^[A-Za-z0-9._:/-]{4,160}$/.test(evidenceReference.trim())) {
      res.status(400).json({ code: 'InvalidVerification', message: 'A controlled evidence reference (4-160 letters, digits, dot, slash, colon, underscore, or hyphen) is required.' });
      return;
    }
    const employee = await FirestoreService.getGovernmentEmployee(employeeId);
    if (!employee || !AdminEmployeeController.canManage(req, employee)) {
      res.status(404).json({ code: 'NotFound', message: 'Employee not found.' });
      return;
    }
    if (employee.accountStatus === 'Disabled' || employee.accountStatus === 'Transferred') {
      res.status(409).json({ code: 'EmployeeInactive', message: 'Disabled or transferred employees cannot be verified.' });
      return;
    }
    await FirestoreService.updateGovernmentEmployee(employeeId, {
      identityVerificationStatus: 'Verified', identityVerifiedBy: req.user!.uid,
      identityVerifiedAt: new Date().toISOString(), identityVerificationReason: reason.trim(),
      identityVerificationEvidenceReference: evidenceReference.trim(),
      updatedBy: req.user!.uid,
    });
    await FirestoreService.addAdminAuditLog({
      event: 'EMPLOYEE_IDENTITY_VERIFIED', userId: req.user!.uid, employeeId,
      reason: reason.trim(), evidenceReference: evidenceReference.trim(),
    });
    res.status(200).json({ employeeId, identityVerificationStatus: 'Verified' });
  }
}
