/**
 * RateGuard Request Dimensions Model
 */

import crypto from 'crypto';

export interface RateGuardDimensions {
  clientIpHash: string;
  userAccountHash?: string | undefined;
  deviceHash?: string | undefined;
  endpoint: string;
  method: string;
  userRole: string;
  isAuthenticated: boolean;
  rawIp: string;
}

export class DimensionFactory {
  private static get hmacSecret(): string {
    const secret = process.env.HMAC_SECRET;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('HMAC_SECRET must be configured with at least 32 bytes.');
    }
    return secret;
  }

  public static createDimensions(
    rawIp: string,
    endpoint: string,
    method: string,
    user?: { uid: string; roleId: string } | undefined,
    deviceHeader?: string | undefined
  ): RateGuardDimensions {
    const clientIpHash = crypto
      .createHmac('sha256', DimensionFactory.hmacSecret)
      .update(rawIp || '127.0.0.1')
      .digest('hex');

    const userAccountHash = user
      ? crypto
          .createHmac('sha256', DimensionFactory.hmacSecret)
          .update(user.uid)
          .digest('hex')
      : undefined;

    const deviceHash = deviceHeader
      ? crypto
          .createHmac('sha256', DimensionFactory.hmacSecret)
          .update(deviceHeader)
          .digest('hex')
      : undefined;

    return {
      clientIpHash,
      userAccountHash,
      deviceHash,
      endpoint,
      method: method.toUpperCase(),
      userRole: user ? user.roleId : 'Anonymous',
      isAuthenticated: Boolean(user),
      rawIp: rawIp || '127.0.0.1',
    };
  }
}
