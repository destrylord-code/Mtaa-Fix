import db from '../config/db.js';
import { getPrismaClient, checkIsPrisma } from '../repositories/client.js';
import { memoryStore } from '../repositories/memoryStore.js';
import { recordStatusHistory } from './statusWorkflow.js';
import { isValidTransition } from './statusWorkflow.js';

const DEFAULT_SLA_HOURS = 48;
const TERMINAL = new Set(['RESOLVED', 'CLOSED', 'REJECTED', 'DUPLICATE', 'CANCELLED', 'AWAITING_CITIZEN_VERIFICATION']);
memoryStore.slaPolicies ||= new Map();

export async function findSlaPolicies() {
  if (checkIsPrisma()) return getPrismaClient().slaPolicy.findMany({ where: { isActive: true } });
  return [...memoryStore.slaPolicies.values()].filter((p) => p.isActive !== false);
}

export function slaHoursFor(report, policies = []) {
  const categoryCode = String(report.category || '').toUpperCase();
  const prefix = categoryCode.startsWith('ROADS') ? 'ROADS' : categoryCode.startsWith('WATER') ? 'WATER' : categoryCode.startsWith('DRAINAGE') ? 'DRAINAGE' : categoryCode.startsWith('SOLID') ? 'WASTE' : categoryCode.startsWith('STREET') ? 'LIGHTING' : categoryCode.startsWith('PUBLIC FACILITIES') ? 'FACILITIES' : categoryCode.startsWith('PUBLIC SAFETY') ? 'SAFETY' : categoryCode;
  const suffix = String(report.subCategory || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const policy = policies.find((p) => p.code === `SLA-${prefix}-${suffix}`);
  return policy?.targetHours || report.subcategory?.slaHours || DEFAULT_SLA_HOURS;
}

export function withSla(report, policies = [], now = Date.now()) {
  const slaHours = slaHoursFor(report, policies);
  const dueAt = new Date(new Date(report.createdAt).getTime() + slaHours * 3600000);
  const overdue = !TERMINAL.has(report.status) && now > dueAt.getTime();
  return { ...report, slaHours, dueAt: dueAt.toISOString(), isOverdue: overdue };
}

/** No arbitrary 100/1000-row cutoff: every matching report is considered. */
export async function allReports(scope = {}) {
  const reports = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await db.findReports({ ...scope, page, limit: 100 });
    reports.push(...result.reports);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);
  return reports;
}

export async function findOverdueReports(scope = {}) {
  const [reports, policies] = await Promise.all([allReports(scope), findSlaPolicies()]);
  const now = Date.now();
  return reports.map((report) => withSla(report, policies, now)).filter((report) => report.isOverdue)
    .map((report) => ({ report, slaHours: report.slaHours, dueAt: report.dueAt, hoursOverdue: Math.round((now - new Date(report.dueAt).getTime()) / 3600000) }));
}

export async function autoEscalateOverdueReports(scope = {}, actorId = null) {
  const overdue = await findOverdueReports(scope);
  const created = [];
  for (const { report, hoursOverdue } of overdue) {
    try {
      if (!isValidTransition(report.status, 'ESCALATED') || await db.findEscalationByReportId(report.id)) continue;
      const changed = await db.transitionReport(report.id, report.status, { status: 'ESCALATED' });
      if (!changed) continue;
      const escalation = await db.createEscalation({ reportId: report.id, reason: `SLA overdue by ${hoursOverdue} hour(s)`, priority: 'HIGH', previousStatus: report.status, escalatedById: actorId });
      await recordStatusHistory({ reportId: report.id, fromStatus: report.status, toStatus: 'ESCALATED', notes: escalation.reason, actorId });
      await db.createAuditLog({ actorId, action: 'AUTO_ESCALATE_OVERDUE', entityType: 'REPORT', entityId: report.id, previousValue: { status: report.status }, newValue: { status: 'ESCALATED', escalationId: escalation.id } });
      created.push(escalation);
    } catch (error) {
      // A concurrent manual escalation is not a failure; other errors are logged
      // without stopping the remainder of the scheduled batch.
      if (error.code !== 'P2002') console.error('[SLA] Auto-escalation failed', { reportId: report.id, message: error.message });
    }
  }
  return created;
}
