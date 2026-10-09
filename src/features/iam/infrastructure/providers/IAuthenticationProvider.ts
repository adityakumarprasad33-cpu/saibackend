/**
 * Identity Provider Interface Contract
 *
 * Encapsulates external identity providers (Firebase Auth, DigiLocker, Gov SSO).
 */

export interface DecodedIdentityToken {
  uid: string;
  email?: string;
  phoneNumber?: string;
  claims: Record<string, unknown>;
}

export interface IAuthenticationProvider {
  verifyIdToken(token: string): Promise<DecodedIdentityToken>;
  revokeRefreshTokens(uid: string): Promise<void>;
}
