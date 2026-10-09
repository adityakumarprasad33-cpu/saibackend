/**
 * Request Correlation & Audit ID Middleware
 *
 * Attaches unique X-Correlation-ID and X-Audit-ID HTTP headers to every incoming request.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface CorrelatedRequest extends Request {
  correlationId?: string;
  auditId?: string;
}

export const correlationMiddleware = (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  const auditId = randomUUID();

  req.correlationId = correlationId;
  req.auditId = auditId;

  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Audit-ID', auditId);

  next();
};
