/**
 * IAM AuthController REST Controller
 *
 * Implements versioned IAM endpoints: /api/v1/auth/register, /login, /logout, /me
 * Firebase is the sole identity provider; backend endpoints only verify Firebase ID tokens.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { PinoSecurityAuditLogger } from '../../infrastructure/logging/PinoSecurityAuditLogger';
import { FirebaseAuthAdapter } from '../../infrastructure/providers/FirebaseAuthAdapter';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';

const firebaseAuth = new FirebaseAuthAdapter();

export class AuthController {
  /**
   * Account creation is handled by Firebase Authentication in the client SDK.
   */
  public static async register(_req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(410).json({
      code: 'Gone',
      message: 'Create the account with Firebase Authentication, then call POST /api/v1/auth/firebase-sync.',
    });
  }

  /**
   * Password sign-in is handled by Firebase Authentication in the client SDK.
   */
  public static async login(_req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(410).json({
      code: 'Gone',
      message: 'Sign in with Firebase Authentication, then call POST /api/v1/auth/firebase-sync.',
    });
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    await firebaseAuth.revokeRefreshTokens(req.user!.uid);
    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'LOGOUT',
      userId: req.user?.uid || 'anonymous',
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: `audit-logout-${Date.now()}`,
    });

    res.status(200).json({ message: 'Refresh tokens revoked successfully' });
  }

  public static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(200).json({
      userId: req.user!.uid,
      email: req.user!.email,
      roleId: req.user!.roleId,
      accountState: 'Active',
      verificationStatus: 'Verified',
    });
  }

  /**
   * Firebase Auth Sync Endpoint
   * Receives Firebase UID and ID token from mobile app, creates/finds user in backend,
   * returns the verified Firebase identity for API calls.
   */
  public static async firebaseSync(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { firebaseUid, email, idToken, displayName, phone, stateCode, district } = req.body;

    if (typeof firebaseUid !== 'string' || typeof email !== 'string' || typeof idToken !== 'string') {
      res.status(400).json({
        code: 'InvalidInput',
        message: 'firebaseUid, email, and idToken are required',
      });
      return;
    }

    try {
      const identity = await firebaseAuth.verifyIdToken(idToken);
      const verifiedEmail = identity.email || '';
      if (identity.uid !== firebaseUid || verifiedEmail.toLowerCase() !== email.toLowerCase()) {
        res.status(401).json({
          code: 'InvalidToken',
          message: 'Firebase identity does not match the supplied account details',
        });
        return;
      }
      const accountStatus = (identity.claims.accountStatus as string | undefined) || 'Active';
      if (accountStatus !== 'Active') {
        res.status(403).json({ code: 'AccountInactive', message: 'This account is not active.' });
        return;
      }
      const roleId = (identity.claims.roleId as string) || 'Citizen';
      const existingProfile = await FirestoreService.getUserProfile(identity.uid);
      const verifiedDisplayName = typeof identity.claims.name === 'string' && identity.claims.name.trim()
        ? identity.claims.name.trim()
        : (typeof displayName === 'string' && displayName.trim()
          ? displayName.trim()
          : (typeof existingProfile?.displayName === 'string' ? existingProfile.displayName : undefined));
      const verifiedPhone = identity.phoneNumber || (typeof phone === 'string' && phone.trim() ? phone.trim() : undefined);
      const verifiedStateCode = typeof stateCode === 'string' && /^[A-Za-z]{2}$/.test(stateCode.trim())
        ? stateCode.trim().toUpperCase()
        : (typeof existingProfile?.stateCode === 'string' ? existingProfile.stateCode : undefined);
      const verifiedDistrict = typeof district === 'string' && district.trim().length <= 100
        ? district.trim()
        : (typeof existingProfile?.district === 'string' ? existingProfile.district : undefined);

      await FirestoreService.saveUser({
        id: identity.uid,
        email: verifiedEmail,
        roleId,
        accountState: accountStatus,
        ...(verifiedDisplayName ? { displayName: verifiedDisplayName } : {}),
        ...(verifiedPhone ? { phone: verifiedPhone } : {}),
        ...(verifiedStateCode ? { stateCode: verifiedStateCode } : {}),
        ...(verifiedDistrict ? { district: verifiedDistrict } : {}),
        ...(typeof identity.claims.email_verified === 'boolean' ? { emailVerified: identity.claims.email_verified } : {}),
        ...(identity.phoneNumber ? { phoneVerified: true } : {}),
      });

      PinoSecurityAuditLogger.logSecurityEvent({
        event: 'FIREBASE_SYNC',
        userId: identity.uid,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'unknown',
        correlationId: req.correlationId,
        auditId: `audit-firebase-sync-${Date.now()}`,
        details: { firebaseUid: identity.uid, email: identity.email },
      });

      res.status(200).json({
        token: idToken,
        expiresIn: 3600,
        user: {
          userId: identity.uid,
          ...(verifiedDisplayName ? { displayName: verifiedDisplayName } : {}),
          email: verifiedEmail,
          phone: identity.phoneNumber,
          roleId,
          accountState: accountStatus,
          ...(verifiedStateCode ? { stateCode: verifiedStateCode } : {}),
          ...(verifiedDistrict ? { district: verifiedDistrict } : {}),
        },
      });
    } catch (err: unknown) {
      res.status(401).json({
        code: 'InvalidToken',
        message: 'Firebase ID token verification failed',
      });
    }
  }
}
