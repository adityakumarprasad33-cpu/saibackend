/**
 * Observability Engine & Extended Health Checks (/health, /ready, /live)
 */

import { Request, Response } from 'express';
import { ConfigProvider } from '../configuration/ConfigProvider';
import { ReleaseManager } from '../release/ReleaseManager';
import { FirestoreService } from '../firestore/FirestoreService';
import { RateGuardService } from '../rateguard/application/RateGuardService';

export interface ReadinessCheckResult {
  status: 'READY' | 'DEGRADED' | 'NOT_READY';
  timestamp: string;
  checks: {
    config: boolean;
    database: boolean;
    storage: boolean;
    rateGuard: boolean;
  };
}

export class ObservabilityEngine {
  public static health = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'ALIVE',
      timestamp: new Date().toISOString(),
      metadata: ReleaseManager.getBuildMetadata(),
    });
  };

  public static readiness = async (_req: Request, res: Response): Promise<void> => {
    const configValid = !!ConfigProvider.getInstance().getConfig();
    let databaseConnected = false;
    let storageConnected = false;
    let rateGuardConnected = false;
    try {
      await FirestoreService.checkConnection();
      databaseConnected = true;
    } catch (error) {
      console.error('[Readiness] Firestore check failed:', error);
    }
    try {
      await FirestoreService.checkStorageConnection();
      storageConnected = true;
    } catch (error) {
      console.error('[Readiness] Cloudinary storage check failed:', error);
    }
    try {
      await RateGuardService.getInstance().checkConnection();
      rateGuardConnected = true;
    } catch (error) {
      console.error('[Readiness] Distributed rate limiter check failed:', error);
    }
    const coreReady = configValid && databaseConnected && rateGuardConnected;
    const result: ReadinessCheckResult = {
      status: !coreReady ? 'NOT_READY' : storageConnected ? 'READY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      checks: {
        config: configValid,
        database: databaseConnected,
        storage: storageConnected,
        rateGuard: rateGuardConnected,
      },
    };
    res.status(coreReady ? 200 : 503).json(result);
  };

  public static liveness = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'ALIVE',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };
}
