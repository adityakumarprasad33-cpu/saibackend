/**
 * DashboardMetricsService
 *
 * Aggregates reusable operational metrics for Official & Admin Portals.
 */

export interface DashboardMetricsResult {
  openCases: number;
  casesToday: number;
  averageResolutionTimeHours: number;
  slaCompliancePercentage: number;
  officerUtilizationPercentage: number | null;
  departmentPerformanceScore: number | null;
  pendingReviewsCount: number;
}

export class DashboardMetricsService {
  public static calculateMetrics(cases: Array<Record<string, any>>): DashboardMetricsResult {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const open = cases.filter(item => !['Resolved', 'Closed'].includes(String(item.state || item.status)));
    const resolved = cases.filter(item => item.resolvedAt && Number.isFinite(Date.parse(item.resolvedAt)));
    const durations = resolved.map(item => (Date.parse(item.resolvedAt) - Date.parse(item.submittedAt || item.createdAt)) / 3600000)
      .filter(value => Number.isFinite(value) && value >= 0);
    const breached = open.filter(item => {
      const deadline = item.assignment?.slaDeadline;
      return deadline && Date.parse(deadline) < now;
    }).length;
    return {
      openCases: open.length,
      casesToday: cases.filter(item => String(item.submittedAt || item.createdAt || '').startsWith(today)).length,
      averageResolutionTimeHours: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
      slaCompliancePercentage: open.length ? ((open.length - breached) / open.length) * 100 : 100,
      officerUtilizationPercentage: null,
      departmentPerformanceScore: null,
      pendingReviewsCount: cases.filter(item => ['Submitted', 'UnderReview'].includes(String(item.state || item.status))).length,
    };
  }
}
