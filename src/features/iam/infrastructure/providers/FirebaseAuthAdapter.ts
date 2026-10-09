/**
 * Firebase Authentication Provider Adapter
 *
 * Implements IAuthenticationProvider for native Firebase Auth ID token verification using firebase-admin SDK.
 */

import { getAuth } from 'firebase-admin/auth';
import { IAuthenticationProvider, DecodedIdentityToken } from './IAuthenticationProvider';
import { firebaseAdminApp } from '../../../../platform/firebase/firebaseAdminApp';

export class FirebaseAuthAdapter implements IAuthenticationProvider {
  public async verifyIdToken(token: string): Promise<DecodedIdentityToken> {
    if (!token || token.length < 10) {
      throw new Error('InvalidToken: Token signature or format invalid');
    }

    try {
      const decodedToken = await getAuth(firebaseAdminApp).verifyIdToken(token, true);
      return {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        phoneNumber: decodedToken.phone_number || '',
        claims: {
          roleId: (decodedToken.roleId as string) || (decodedToken.role as string) || 'Citizen',
          ...decodedToken,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  public async revokeRefreshTokens(uid: string): Promise<void> {
    await getAuth(firebaseAdminApp).revokeRefreshTokens(uid);
  }
}
