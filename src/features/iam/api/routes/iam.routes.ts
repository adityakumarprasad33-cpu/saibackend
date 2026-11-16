/**
 * Versioned IAM Gateway Router (/api/v1/auth, /api/v1/users, /api/v1/admin)
 */

import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AdminEmployeeController } from '../controllers/AdminEmployeeController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { correlationMiddleware } from '../middlewares/correlationMiddleware';
import { requirePermission, requireRole } from '../middlewares/rbacMiddleware';
import { rateLimiter } from '../middlewares/rateLimitingMiddleware';
import { PermissionController } from '../controllers/PermissionController';
import { rateGuardMiddleware } from '../../../../platform/rateguard/middleware/rateGuardMiddleware';

const router = Router();

// Apply correlation middleware globally to IAM router
router.use(correlationMiddleware);

// Rate limiter for unauthenticated auth endpoints (100 requests / min)
const authLimiter = rateLimiter({ maxRequests: 100, windowMs: 60 * 1000 });

// Unauthenticated Public IAM Endpoints
router.post('/auth/register', authLimiter, rateGuardMiddleware, AuthController.register);
router.post('/auth/login', authLimiter, rateGuardMiddleware, AuthController.login);
router.post('/auth/firebase-sync', authLimiter, rateGuardMiddleware, AuthController.firebaseSync);

// Friendly GET info handlers for browser testing
router.get('/auth/login', authLimiter, rateGuardMiddleware, (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/auth/login',
    method: 'POST',
    description: 'Use Firebase Authentication for password sign-in, then POST the ID token to /api/v1/auth/firebase-sync.',
  });
});

router.get('/auth/register', authLimiter, rateGuardMiddleware, (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/auth/register',
    method: 'POST',
    description: 'Use Firebase Authentication to create accounts, then POST the ID token to /api/v1/auth/firebase-sync.',
  });
});

// The one-time invitation token is the credential for this registration flow.
router.post('/auth/employee-invitations/consume', authLimiter, rateGuardMiddleware, AdminEmployeeController.consumeInvitation);

// Private IAM APIs require a Firebase ID token and both IP and account limits.
router.use(authMiddleware, rateGuardMiddleware);

// Authenticated User IAM Endpoints
router.post('/auth/logout', AuthController.logout);
router.get('/users/me', AuthController.me);
router.get('/users/profile', AuthController.me);

// Admin-Only Government Employee Provisioning & IAM Endpoints
const adminLimiter = rateLimiter({ maxRequests: 30, windowMs: 60 * 1000 });
const requireAdmin = requireRole('DepartmentAdmin', 'SuperAdmin');

router.get(
  '/admin/permissions/catalog',
  requireAdmin,
  PermissionController.catalog,
);

router.get(
  '/admin/government-employees/:id/permissions',
  requireAdmin,
  PermissionController.getEmployeePermissions,
);

router.get(
  '/admin/government-employees/:id/audit-history',
  requireAdmin,
  PermissionController.auditHistory,
);

router.post(
  '/admin/government-employees',
  requireAdmin,
  requirePermission('iam.employee.provision'),
  adminLimiter,
  AdminEmployeeController.provisionEmployee
);

router.get(
  '/admin/government-employees',
  requireAdmin,
  requirePermission('iam.employee.list'),
  AdminEmployeeController.listEmployees
);

router.put(
  '/admin/government-employees/:id/status',
  requireAdmin,
  requirePermission('iam.employee.status.update'),
  AdminEmployeeController.updateEmployeeStatus
);

router.post(
  '/admin/government-employees/:id/verify-identity',
  requireAdmin,
  requirePermission('iam.employee.verify'),
  adminLimiter,
  AdminEmployeeController.verifyEmployeeIdentity,
);

router.post(
  '/admin/government-employees/:id/transfer',
  requireAdmin,
  requirePermission('iam.employee.transfer'),
  AdminEmployeeController.transferEmployee
);

router.post(
  '/admin/government-employees/:id/permissions/grant',
  requireAdmin,
  requirePermission('iam.permissions.grant'),
  adminLimiter,
  (req, res) => PermissionController.change(req, res, 'GRANT'),
);

router.post(
  '/admin/government-employees/:id/permissions/revoke',
  requireAdmin,
  requirePermission('iam.permissions.revoke'),
  adminLimiter,
  (req, res) => PermissionController.change(req, res, 'REVOKE'),
);

router.post(
  '/admin/government-employees/:id/invitation',
  requireAdmin,
  requirePermission('iam.employee.invite'),
  adminLimiter,
  AdminEmployeeController.resendInvitation,
);

router.post(
  '/admin/sessions/force-logout',
  requireAdmin,
  requirePermission('iam.session.revoke'),
  AdminEmployeeController.forceLogout
);

router.get(
  '/admin/audit-logs',
  requireRole('SuperAdmin'),
  requirePermission('grievance.cross_scope'),
  requirePermission('iam.audit.read'),
  AdminEmployeeController.getAuditLogs
);

export const iamRouter = router;
