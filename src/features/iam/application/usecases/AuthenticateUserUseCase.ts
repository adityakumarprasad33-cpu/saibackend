/**
 * AuthenticateUserUseCase Application Service
 *
 * Coordinates identity verification, user profile fetching, session creation, and DTO transformation.
 */

import { AuthResponseDTO } from '../dtos/AuthDTOs';
import { ApplicationUser } from '../../domain/entities/ApplicationUser';
import { Session } from '../../domain/entities/Session';

export interface AuthenticateUserRequest {
  identityToken: string;
  deviceId: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  ipAddress: string;
  userAgent: string;
}

export class AuthenticateUserUseCase {
  public execute(user: ApplicationUser, session: Session, token: string): AuthResponseDTO {
    const userJson = user.toJSON();
    const sessionJson = session.toJSON();

    return {
      token,
      expiresIn: 3600,
      user: {
        userId: userJson.userId,
        email: userJson.email,
        phone: userJson.phone,
        displayName: userJson.displayName,
        photoUrl: userJson.photoUrl,
        roleId: userJson.roleId,
        departmentId: userJson.departmentId,
        designation: userJson.designation,
        accountState: userJson.accountState,
        verificationStatus: userJson.verificationStatus,
        languagePreference: userJson.languagePreference,
        createdAt: userJson.createdAt.toISOString(),
        lastLoginAt: userJson.lastLoginAt ? userJson.lastLoginAt.toISOString() : undefined,
      },
      session: {
        sessionId: sessionJson.sessionId,
        deviceId: sessionJson.deviceId,
        platform: sessionJson.platform,
        createdAt: sessionJson.createdAt.toISOString(),
        expiresAt: sessionJson.expiresAt.toISOString(),
        lastSeenAt: sessionJson.lastSeenAt.toISOString(),
      },
    };
  }
}
