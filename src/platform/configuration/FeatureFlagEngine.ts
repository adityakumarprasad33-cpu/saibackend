/**
 * Feature Flag Engine & Emergency Kill Switch Platform
 */

export interface FeatureFlag {
  key: String;
  enabled: boolean;
  percentageRollout: number;
  emergencyKillSwitch: boolean;
}

export class FeatureFlagEngine {
  private static flags: Map<string, FeatureFlag> = new Map([
    ['ENABLE_AI_CLASSIFICATION', { key: 'ENABLE_AI_CLASSIFICATION', enabled: true, percentageRollout: 100, emergencyKillSwitch: false }],
    ['ENABLE_NOTIFICATIONS_QUEUE', { key: 'ENABLE_NOTIFICATIONS_QUEUE', enabled: true, percentageRollout: 100, emergencyKillSwitch: false }],
    ['ENABLE_SLA_ENGINE', { key: 'ENABLE_SLA_ENGINE', enabled: true, percentageRollout: 100, emergencyKillSwitch: false }],
  ]);

  public static isEnabled(flagKey: string): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;
    if (flag.emergencyKillSwitch) return false;
    return flag.enabled;
  }

  public static setEmergencyKillSwitch(flagKey: string, killed: boolean): void {
    const flag = this.flags.get(flagKey);
    if (flag) {
      flag.emergencyKillSwitch = killed;
      this.flags.set(flagKey, flag);
    }
  }
}
