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

const router = Router();

// Apply correlation middleware globally to IAM router
router.use(correlationMiddleware);

// Rate limiter for unauthenticated auth endpoints (100 requests / min)
const authLimiter = rateLimiter({ maxRequests: 100, windowMs: 60 * 1000 });

// Unauthenticated Public IAM Endpoints
router.post('/auth/register', authLimiter, AuthController.register);
router.post('/auth/login', authLimiter, AuthController.login);
router.post('/auth/firebase-sync', authLimiter, AuthController.firebaseSync);

// Friendly GET info handlers for browser testing
router.get('/auth/login', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/auth/login',
    method: 'POST',
    description: 'Use Firebase Authentication for password sign-in, then POST the ID token to /api/v1/auth/firebase-sync.',
  });
});

router.get('/auth/register', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/auth/register',
    method: 'POST',
    description: 'Use Firebase Authentication to create accounts, then POST the ID token to /api/v1/auth/firebase-sync.',
  });
});

// Authenticated User IAM Endpoints
router.post('/auth/logout', authMiddleware, AuthController.logout);
router.get('/users/me', authMiddleware, AuthController.me);
router.get('/users/profile', authMiddleware, AuthController.me);

// Admin-Only Government Employee Provisioning & IAM Endpoints
const adminLimiter = rateLimiter({ maxRequests: 30, windowMs: 60 * 1000 });
const requireAdmin = requireRole('DepartmentAdmin', 'SuperAdmin');

// The single-use invitation secret is submitted in the POST body, never in a URL or loggable query string.
router.post('/auth/employee-invitations/consume', authLimiter, AdminEmployeeController.consumeInvitation);

router.get(
  '/admin/permissions/catalog',
  authMiddleware,
  requireAdmin,
  PermissionController.catalog,
);

router.get(
  '/admin/government-employees/:id/permissions',
  authMiddleware,
  requireAdmin,
  PermissionController.getEmployeePermissions,
);

router.get(
  '/admin/government-employees/:id/audit-history',
  authMiddleware,
  requireAdmin,
  PermissionController.auditHistory,
);

router.post(
  '/admin/government-employees',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.provision'),
  adminLimiter,
  AdminEmployeeController.provisionEmployee
);

router.get(
  '/admin/government-employees',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.list'),
  AdminEmployeeController.listEmployees
);

router.put(
  '/admin/government-employees/:id/status',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.status.update'),
  AdminEmployeeController.updateEmployeeStatus
);

router.post(
  '/admin/government-employees/:id/verify-identity',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.verify'),
  adminLimiter,
  AdminEmployeeController.verifyEmployeeIdentity,
);

router.post(
  '/admin/government-employees/:id/transfer',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.transfer'),
  AdminEmployeeController.transferEmployee
);

router.post(
  '/admin/government-employees/:id/permissions/grant',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.permissions.grant'),
  adminLimiter,
  (req, res) => PermissionController.change(req, res, 'GRANT'),
);

router.post(
  '/admin/government-employees/:id/permissions/revoke',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.permissions.revoke'),
  adminLimiter,
  (req, res) => PermissionController.change(req, res, 'REVOKE'),
);

router.post(
  '/admin/government-employees/:id/invitation',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.employee.invite'),
  adminLimiter,
  AdminEmployeeController.resendInvitation,
);

router.post(
  '/admin/sessions/force-logout',
  authMiddleware,
  requireAdmin,
  requirePermission('iam.session.revoke'),
  AdminEmployeeController.forceLogout
);

router.get(
  '/admin/audit-logs',
  authMiddleware,
  requireRole('SuperAdmin'),
  requirePermission('grievance.cross_scope'),
  requirePermission('iam.audit.read'),
  AdminEmployeeController.getAuditLogs
);

export const iamRouter = router;
