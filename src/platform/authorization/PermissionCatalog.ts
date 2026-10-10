/** Server-maintained allowlist of identifiers stored on government employee records. */
export const PERMISSION_CATALOG = Object.freeze([
  'grievance.read',
  'grievance.list',
  'grievance.update',
  'grievance.cross_scope',
  'timeline.read',
  'comment.citizen.create',
  'comment.internal.create',
  'attachment.read',
  'attachment.upload',
  'feedback.create',
  'case.accept',
  'case.assign',
  'case.reassign',
  'case.investigate',
  'case.resolve',
  'case.close',
  'case.metrics.read',
  'iam.employee.provision',
  'iam.employee.invite',
  'iam.employee.list',
  'iam.employee.status.update',
  'iam.employee.transfer',
  'iam.employee.cross_scope',
  'iam.session.revoke',
  'iam.audit.read',
  'iam.permissions.grant',
  'iam.permissions.revoke',
  'iam.employee.verify',
  'grievance.routing.manage',
  'grievance.triage.read',
  'grievance.triage.route',
] as const);

export type PermissionId = typeof PERMISSION_CATALOG[number];
const catalogSet: ReadonlySet<string> = new Set(PERMISSION_CATALOG);

export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === 'string' && catalogSet.has(value);
}
