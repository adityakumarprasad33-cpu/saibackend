/**
 * RateGuard Policy Contract & Configurable Registry
 */

export interface RateLimitPolicy {
  name: string;
  endpointPattern: RegExp;
  method?: string | undefined;
  algorithm: 'SLIDING_WINDOW' | 'TOKEN_BUCKET' | 'RATE_CONCURRENCY';
  limit: number;
  windowSeconds: number;
  failClosed: boolean;
  maxConcurrency?: number | undefined;
  penaltyCooldownSeconds?: number | undefined;
}

export class PolicyRegistry {
  private static policies: RateLimitPolicy[] = [
    {
      name: 'AUTH_LOGIN',
      endpointPattern: /^\/api\/v1\/auth\/login$/i,
      method: 'POST',
      algorithm: 'SLIDING_WINDOW',
      limit: 5,
      windowSeconds: 60,
      failClosed: true,
      penaltyCooldownSeconds: 300,
    },
    {
      name: 'AUTH_REGISTER',
      endpointPattern: /^\/api\/v1\/auth\/register$/i,
      method: 'POST',
      algorithm: 'SLIDING_WINDOW',
      limit: 3,
      windowSeconds: 3600,
      failClosed: true,
      penaltyCooldownSeconds: 86400,
    },
    {
      name: 'ADMIN_PROVISION',
      endpointPattern: /^\/api\/v1\/admin\/government-employees/i,
      algorithm: 'SLIDING_WINDOW',
      limit: 20,
      windowSeconds: 3600,
      failClosed: true,
    },
    {
      name: 'AI_ASSISTANT',
      endpointPattern: /^\/api\/v1\/ai/i,
      algorithm: 'RATE_CONCURRENCY',
      limit: 30,
      windowSeconds: 60,
      failClosed: false,
      maxConcurrency: 2,
    },
    {
      name: 'PUBLIC_HIERARCHY',
      endpointPattern: /^\/api\/v1\/hierarchy/i,
      algorithm: 'TOKEN_BUCKET',
      limit: 120,
      windowSeconds: 60,
      failClosed: false,
    },
    {
      name: 'GENERAL_API',
      endpointPattern: /^\/api\/v1\//i,
      algorithm: 'TOKEN_BUCKET',
      limit: 60,
      windowSeconds: 60,
      failClosed: false,
    },
  ];

  public static resolvePolicy(endpoint: string, method: string): RateLimitPolicy {
    for (const policy of this.policies) {
      if (policy.endpointPattern.test(endpoint)) {
        if (!policy.method || policy.method === method.toUpperCase()) {
          return policy;
        }
      }
    }

    return {
      name: 'DEFAULT_FALLBACK',
      endpointPattern: /.*/,
      algorithm: 'TOKEN_BUCKET',
      limit: 60,
      windowSeconds: 60,
      failClosed: false,
    };
  }
}
