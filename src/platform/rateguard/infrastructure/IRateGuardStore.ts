/**
 * RateGuard Store Adapter Interface
 */

import { RateGuardDimensions } from '../domain/models/Dimensions';
import { RateLimitPolicy } from '../domain/policies/PolicyRegistry';

export interface RateEvaluationResult {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface IRateGuardStore {
  evaluate(
    dimensions: RateGuardDimensions,
    policy: RateLimitPolicy
  ): Promise<RateEvaluationResult>;

  isAvailable(): boolean;
}
