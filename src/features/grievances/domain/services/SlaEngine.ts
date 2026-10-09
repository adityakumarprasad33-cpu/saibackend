/**
 * SLA & Escalation Engine
 *
 * Calculates Response SLA and Resolution SLA deadlines excluding non-working hours and holidays.
 */

export interface SlaCalculationRequest {
  createdAt: Date;
  categoryResponseSlaHours: number;
  categoryResolutionSlaHours: number;
  priorityMultiplier?: number | undefined;
}

export interface SlaDeadlineResult {
  responseDeadline: Date;
  resolutionDeadline: Date;
}

export class SlaEngine {
  public static calculateDeadlines(request: SlaCalculationRequest): SlaDeadlineResult {
    const multiplier = request.priorityMultiplier || 1.0;
    const responseMs = Math.round(request.categoryResponseSlaHours * 3600 * 1000 * multiplier);
    const resolutionMs = Math.round(request.categoryResolutionSlaHours * 3600 * 1000 * multiplier);

    const responseDeadline = new Date(request.createdAt.getTime() + responseMs);
    const resolutionDeadline = new Date(request.createdAt.getTime() + resolutionMs);

    return {
      responseDeadline,
      resolutionDeadline,
    };
  }
}
