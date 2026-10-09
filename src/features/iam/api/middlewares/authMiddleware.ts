/**
 * IAM Authentication Middleware
 *
 * Extracts and verifies Bearer ID tokens and attaches user context.
 * All environments require a valid Firebase ID token.
 */

import { Response, NextFunction } from 'express';
import { CorrelatedRequest } from './correlationMiddleware';
import { FirebaseAuthAdapter } from '../../infrastructure/providers/FirebaseAuthAdapter';

export interface AuthenticatedRequest extends CorrelatedRequest {
  user?: {
    uid: string;
    email: string;
    roleId: string;
    departmentId?: string | undefined;
    sectorId?: string | undefined;
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
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      roleId: (decoded.claims.roleId as string) || 'citizen',
      departmentId: typeof decoded.claims.departmentId === 'string' ? decoded.claims.departmentId : undefined,
      sectorId: typeof decoded.claims.sectorId === 'string' ? decoded.claims.sectorId : undefined,
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
