import db from '../config/db.js';
import { scopeReportQuery, buildEscalationScope } from '../services/jurisdiction.js';
import { getDbHealthMetrics } from '../services/dbHealthMetrics.js';
import { allReports, findSlaPolicies, withSla } from '../services/slaService.js';
import { sanitizeReport } from '../services/reportValidation.js';
import { isDatabaseConnected } from '../repositories/client.js';

const countBy = (items, key) => items.reduce((result, item) => {
  const value = item[key] || 'UNKNOWN';
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
const isOpen = (status) => !['RESOLVED', 'REJECTED', 'CLOSED', 'CANCELLED', 'DUPLICATE'].includes(status);
const getScopedReports = async (user) => {
  const [reports, policies] = await Promise.all([allReports(scopeReportQuery(user)), findSlaPolicies()]);
  return reports.map((report) => withSla(report, policies));
};

function scopeDescriptor(user) {
  if (user.role === 'SUPER_ADMIN') return { label: 'System-wide', level: 'system' };
  if (user.role === 'GOVERNOR') return { label: `County: ${user.county || 'Kisii'}`, level: 'county' };
  if (['FIELD_OFFICER', 'OFFICER'].includes(user.role)) return { label: 'Personally assigned cases', level: 'personal' };
  if (user.role === 'SUBCOUNTY_ADMIN') return { label: `Sub-county: ${user.subCounty || user.subCountyId || 'unassigned'}`, level: 'subcounty' };
  if (user.role === 'WARD_ADMIN') return { label: `Ward: ${user.ward || user.wardId || 'unassigned'}`, level: 'ward' };
  return { label: `Department: ${user.department?.name || user.departmentId || 'unassigned'}`, level: 'department' };
}

export const getDashboardOverview = async (req, res, next) => {
  try {
    const user = req.user;
    const reports = await getScopedReports(user);
    const officers = await db.findOfficers({ isActive: true, ...(user.departmentId ? { departmentId: user.departmentId } : {}) });
    const { escalations } = await db.findEscalatedReports(buildEscalationScope(user));
    const open = reports.filter((r) => isOpen(r.status));
    const completed = reports.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status));
    const data = {
      scope: scopeDescriptor(user), totalReports: reports.length, openReports: open.length,
      resolvedReports: completed.length, overdueReports: reports.filter((r) => r.isOverdue).length,
      resolutionRate: reports.length ? Number((completed.length / reports.length * 100).toFixed(2)) : 0,
      activeOfficers: officers.filter((o) => o.isActive && (!user.countyId || o.countyId === user.countyId)).length,
      openEscalations: escalations.length, degraded: !isDatabaseConnected(),
      pendingAssignments: reports.filter((r) => !r.assignedOfficerId && isOpen(r.status)).length,
      awaitingVerification: reports.filter((r) => r.status === 'RESOLVED').length,
      assignedToMe: reports.filter((r) => r.assignedOfficerId === user.id).length,
      departmentId: user.departmentId || null, wardId: user.wardId || null, subCountyId: user.subCountyId || null,
    };
    return res.json({ status: 'success', data });
  } catch (error) { next(error); }
};
export const getDashboardReports = async (req, res, next) => {
  try {
    const all = await getScopedReports(req.user);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const reports = all.slice((page - 1) * limit, page * limit).map((r) => sanitizeReport(r, req.user));
    return res.json({ status: 'success', data: { reports, total: all.length, page, limit, totalPages: Math.ceil(all.length / limit),
      byStatus: countBy(all, 'status'), byPriority: countBy(all, 'priority') } });
  } catch (error) { next(error); }
};
export const getDashboardCategories = async (req, res, next) => {
  try { return res.json({ status: 'success', data: { categories: countBy(await getScopedReports(req.user), 'category') } }); } catch (error) { next(error); }
};
export const getDashboardDepartments = async (req, res, next) => {
  try {
    const [departments, reports] = await Promise.all([db.findDepartments(), getScopedReports(req.user)]);
    const counts = countBy(reports, 'departmentId');
    const visible = req.user.departmentId ? departments.filter((d) => d.id === req.user.departmentId) : departments;
    return res.json({ status: 'success', data: { departments: visible.map((d) => ({ ...d, reportCount: counts[d.id] || 0 })) } });
  } catch (error) { next(error); }
};
export const getDashboardWards = async (req, res, next) => {
  try { return res.json({ status: 'success', data: { wards: countBy(await getScopedReports(req.user), 'ward') } }); } catch (error) { next(error); }
};
export const getDashboardPerformance = async (req, res, next) => {
  try {
    const reports = await getScopedReports(req.user);
    const completed = reports.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status));
    const hours = completed.map((r) => (new Date(r.resolvedAt || r.updatedAt) - new Date(r.createdAt)) / 3600000).filter((n) => Number.isFinite(n) && n >= 0);
    const withinSla = completed.filter((r) => new Date(r.resolvedAt || r.updatedAt) <= new Date(r.dueAt)).length;
    return res.json({ status: 'success', data: { completedReports: completed.length,
      averageResolutionHours: hours.length ? Number((hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(2)) : 0,
      overdueReports: reports.filter((r) => r.isOverdue).length,
      slaComplianceRate: completed.length ? Number((withinSla / completed.length * 100).toFixed(2)) : 0,
    } });
  } catch (error) { next(error); }
};
export const getDashboardEscalations = async (req, res, next) => {
  try {
    const { escalations, degraded } = await db.findEscalatedReports(buildEscalationScope(req.user));
    const items = escalations.map((e) => ({ ...e, report: e.report ? sanitizeReport(e.report, req.user) : undefined }));
    return res.json({ status: 'success', total: items.length, degraded, data: { escalations: items, degraded } });
  } catch (error) { next(error); }
};
export const getDashboardHealth = async (req, res, next) => {
  try { return res.json({ status: 'success', data: { ...getDbHealthMetrics(), databaseConnected: isDatabaseConnected() } }); } catch (error) { next(error); }
};
export default { getDashboardOverview, getDashboardReports, getDashboardCategories, getDashboardDepartments, getDashboardWards, getDashboardPerformance, getDashboardEscalations, getDashboardHealth };
