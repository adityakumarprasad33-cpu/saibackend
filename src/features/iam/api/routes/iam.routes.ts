/**
 * Versioned IAM Gateway Router (/api/v1/auth, /api/v1/users, /api/v1/admin)
 */

import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AdminEmployeeController } from '../controllers/AdminEmployeeController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { correlationMiddleware } from '../middlewares/correlationMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { rateLimiter } from '../middlewares/rateLimitingMiddleware';

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

router.post(
  '/admin/government-employees',
  authMiddleware,
  requireAdmin,
  adminLimiter,
  AdminEmployeeController.provisionEmployee
);

router.get(
  '/admin/government-employees',
  authMiddleware,
  requireAdmin,
  AdminEmployeeController.listEmployees
);

router.put(
  '/admin/government-employees/:id/status',
  authMiddleware,
  requireAdmin,
  AdminEmployeeController.updateEmployeeStatus
);

router.post(
  '/admin/government-employees/:id/transfer',
  authMiddleware,
  requireAdmin,
  AdminEmployeeController.transferEmployee
);

router.post(
  '/admin/sessions/force-logout',
  authMiddleware,
  requireAdmin,
  AdminEmployeeController.forceLogout
);

router.get(
  '/admin/audit-logs',
  authMiddleware,
  requireAdmin,
  AdminEmployeeController.getAuditLogs
);

export const iamRouter = router;
