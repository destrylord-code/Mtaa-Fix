import { isValidTransition } from './statusWorkflow.js';

// These set names are retained for the existing route imports. Membership is
// permission to reach an endpoint, NOT permission to see every record.
export const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'GOVERNOR', 'CECM', 'CHIEF_OFFICER']);
export const WARD_SCOPED_ROLES = new Set(['OFFICER', 'FIELD_OFFICER', 'TECHNICAL_SUPERVISOR', 'WARD_ADMIN', 'SUBCOUNTY_ADMIN']);
export const DEPARTMENT_SCOPED_ROLES = new Set(['CHIEF_OFFICER', 'TECHNICAL_HEAD', 'CECM', 'DISASTER_MANAGER', 'ENFORCEMENT_OFFICER', 'DEPARTMENTAL_ADMIN', 'ADMIN']);
export const STATUS_CHANGE_ROLES = new Set(['OFFICER', 'FIELD_OFFICER', 'TECHNICAL_SUPERVISOR', 'TECHNICAL_HEAD', 'CHIEF_OFFICER', 'CECM', 'GOVERNOR', 'ADMIN', 'SUPER_ADMIN', 'DISASTER_MANAGER', 'ENFORCEMENT_OFFICER']);
const ASSIGNED_ROLES = new Set(['FIELD_OFFICER', 'OFFICER']);
const NO_SCOPE = Object.freeze({ __noAccess: true });

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** One fail-closed scope implementation for lists, details, and dashboards. */
export function scopeReportQuery(user, query = {}) {
  if (!user) return { ...query, ...NO_SCOPE };
  if (user.role === 'SUPER_ADMIN') return { ...query };
  if (user.role === 'GOVERNOR') {
    return { ...query, ...(user.countyId ? { countyId: user.countyId } : { county: user.county || 'Kisii' }) };
  }
  if (user.role === 'CITIZEN') return { ...query, reporterId: user.id };
  if (ASSIGNED_ROLES.has(user.role)) return { ...query, assignedOfficerId: user.id };
  if (user.role === 'SUBCOUNTY_ADMIN') {
    if (user.subCountyId) return { ...query, subCountyId: user.subCountyId };
    if (user.subCounty) return { ...query, subCounty: user.subCounty };
    return { ...query, ...NO_SCOPE };
  }
  if (user.role === 'WARD_ADMIN') {
    if (user.wardId) return { ...query, wardId: user.wardId };
    if (user.ward) return { ...query, ward: user.ward, ...(user.subCounty ? { subCounty: user.subCounty } : {}) };
    return { ...query, ...NO_SCOPE };
  }
  if (user.role === 'TECHNICAL_SUPERVISOR') {
    if (!user.departmentId) return { ...query, ...NO_SCOPE };
    return { ...query, departmentId: user.departmentId,
      ...(user.wardId ? { wardId: user.wardId } : user.ward ? { ward: user.ward } : {}) };
  }
  if (DEPARTMENT_SCOPED_ROLES.has(user.role)) {
    return user.departmentId ? { ...query, departmentId: user.departmentId } : { ...query, ...NO_SCOPE };
  }
  return { ...query, ...NO_SCOPE };
}

export const scopeDashboardQuery = scopeReportQuery;

export function canAccessReport(user, report) {
  if (!user || !report) return false;
  const scope = scopeReportQuery(user);
  if (scope.__noAccess) return false;
  return Object.entries(scope).every(([key, value]) => {
    if (['page', 'limit', 'sortBy', 'sortOrder'].includes(key)) return true;
    if (['ward', 'county', 'subCounty'].includes(key)) return report[key] != null && same(report[key], value);
    return report[key] === value;
  });
}

export function buildEscalationScope(user) {
  const scope = scopeReportQuery(user);
  if (!Object.keys(scope).length) return {};
  return { report: scope };
}

export function canChangeStatus(user) {
  return Boolean(user && STATUS_CHANGE_ROLES.has(user.role));
}

export function canPerformTransition(user, fromStatus, toStatus) {
  if (!canChangeStatus(user) || !fromStatus || !toStatus) return false;
  if (!isValidTransition(fromStatus, toStatus)) return false;
  if (['WARD_ADMIN', 'SUBCOUNTY_ADMIN', 'DEPARTMENTAL_ADMIN'].includes(user.role)) return false;
  if (ASSIGNED_ROLES.has(user.role)) return !['CLOSED', 'REOPENED', 'ESCALATED', 'RESOLVED'].includes(toStatus);
  if (user.role === 'TECHNICAL_SUPERVISOR') return toStatus !== 'CLOSED';
  return true;
}

/** Staff may see reporter contact details only for a report in their scope. */
export function canSeeReporterIdentity(user, report) {
  return Boolean(user && canAccessReport(user, report) && (user.role !== 'CITIZEN' || report.reporterId === user.id));
}
