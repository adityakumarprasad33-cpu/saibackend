/**
 * Pino Security Audit Logger
 *
 * Emits structured JSON security audit events with automatic PII redaction.
 */

import pino from 'pino';

export type SecurityEventType =
  | 'Login'
  | 'Logout'
  | 'Registration'
  | 'RoleChange'
  | 'PermissionChange'
  | 'AccountLocked'
  | 'PasswordReset'
  | 'FailedLogin'
  | 'SuspiciousActivity'
  | 'GOVERNMENT_EMPLOYEE_CREATED'
  | 'GOVERNMENT_EMPLOYEE_UPDATED'
  | 'EMPLOYEE_SUSPENDED'
  | 'EMPLOYEE_DISABLED'
  | 'EMPLOYEE_REACTIVATED'
  | 'EMPLOYEE_TRANSFERRED'
  | 'FORCED_LOGOUT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SUSPICIOUS_ACTIVITY'
  | 'UnauthorizedAccessAttempt';

export interface SecurityAuditEvent {
  event: SecurityEventType | string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  correlationId?: string | undefined;
  auditId: string;
  details?: Record<string, unknown> | undefined;
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['password', 'token', 'secret', 'authorization'],
});

export class PinoSecurityAuditLogger {
  public static logSecurityEvent(event: SecurityAuditEvent): void {
    logger.info({
      type: 'SECURITY_AUDIT',
      auditId: event.auditId,
      securityEvent: event.event,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      correlationId: event.correlationId,
      timestamp: new Date().toISOString(),
      details: event.details,
    });
  }
}
