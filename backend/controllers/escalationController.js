import db from '../config/db.js';
import { findOverdueReports, autoEscalateOverdueReports } from '../services/slaService.js';
import { buildEscalationScope, canAccessReport, scopeReportQuery } from '../services/jurisdiction.js';
import { isValidTransition, recordStatusHistory } from '../services/statusWorkflow.js';
import { notifyReportStatus } from '../services/notifyService.js';
import { sanitizeReport } from '../services/reportValidation.js';

const clean = (item, user) => ({ ...item, report: item.report ? sanitizeReport(item.report, user) : undefined });
const forbidden = (res) => res.status(403).json({ status: 'error', message: 'This report is outside your jurisdiction.' });

export const getEscalatedReports = async (req, res, next) => {
  try {
    const { escalations, degraded } = await db.findEscalatedReports(buildEscalationScope(req.user));
    const items = escalations.filter((item) => !item.report || canAccessReport(req.user, item.report)).map((item) => clean(item, req.user));
    return res.status(200).json({ status: 'success', total: items.length, degraded, data: { escalations: items, degraded } });
  } catch (error) { next(error); }
};
export const getEscalation = async (req, res, next) => {
  try {
    const escalation = await db.findEscalationById(req.params.id);
    if (!escalation) return res.status(404).json({ status: 'error', message: 'Escalation not found.' });
    const report = escalation.report || await db.findReportById(escalation.reportId);
    if (!canAccessReport(req.user, report)) return forbidden(res);
    return res.status(200).json({ status: 'success', data: { escalation: clean(escalation, req.user) } });
  } catch (error) { next(error); }
};
export const getOverdueReports = async (req, res, next) => {
  try {
    const overdue = await findOverdueReports(scopeReportQuery(req.user));
    return res.status(200).json({ status: 'success', total: overdue.length, data: { overdue: overdue.map((item) => ({ ...item, report: sanitizeReport(item.report, req.user) })) } });
  } catch (error) { next(error); }
};

async function escalateReport(report, reason, priority, actorId) {
  if (!isValidTransition(report.status, 'ESCALATED')) return null;
  const changed = await db.transitionReport(report.id, report.status, { status: 'ESCALATED' });
  if (!changed) return null;
  const escalation = await db.createEscalation({ reportId: report.id, reason, priority, escalatedById: actorId, previousStatus: report.status });
  await recordStatusHistory({ reportId: report.id, fromStatus: report.status, toStatus: 'ESCALATED', notes: reason, actorId });
  await db.createAuditLog({ actorId, action: 'REPORT_ESCALATED', entityType: 'REPORT', entityId: report.id, previousValue: { status: report.status }, newValue: { status: 'ESCALATED', escalationId: escalation.id } });
  await notifyReportStatus(changed, 'ESCALATED', reason);
  return escalation;
}

export const manuallyEscalate = async (req, res, next) => {
  try {
    const { reportId, reason, priority } = req.body;
    const report = await db.findReportById(reportId);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    if (!canAccessReport(req.user, report)) return forbidden(res);
    if (!isValidTransition(report.status, 'ESCALATED')) return res.status(409).json({ status: 'error', message: 'This report cannot be escalated at its current stage.' });
    if (await db.findEscalationByReportId(reportId)) return res.status(409).json({ status: 'error', message: 'Report already has an open escalation.' });
    const escalation = await escalateReport(report, reason, priority, req.user.id);
    if (!escalation) return res.status(409).json({ status: 'error', message: 'The report changed or already has an escalation. Refresh and try again.' });
    return res.status(201).json({ status: 'success', message: 'Report escalated successfully.', data: { escalation } });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ status: 'error', message: 'Report already has an open escalation.' });
    next(error);
  }
};
export const autoEscalateOverdue = async (req, res, next) => {
  try {
    const created = await autoEscalateOverdueReports(scopeReportQuery(req.user), req.user.id);
    return res.status(200).json({ status: 'success', total: created.length, data: { escalations: created } });
  } catch (error) { next(error); }
};
export const resolveEscalation = async (req, res, next) => {
  try {
    const existing = await db.findEscalationById(req.params.id);
    if (!existing) return res.status(404).json({ status: 'error', message: 'Escalation not found.' });
    const report = await db.findReportById(existing.reportId);
    if (!canAccessReport(req.user, report)) return forbidden(res);
    if (existing.status === 'RESOLVED') return res.status(409).json({ status: 'error', message: 'Escalation is already resolved.' });
    const escalation = await db.resolveEscalation(req.params.id, { ...req.body, resolvedById: req.user.id });
    const restore = existing.previousStatus && existing.previousStatus !== 'ESCALATED' ? existing.previousStatus : 'UNDER_REVIEW';
    if (report.status === 'ESCALATED' && isValidTransition(report.status, restore)) {
      const updated = await db.transitionReport(report.id, report.status, { status: restore });
      if (updated) {
        await recordStatusHistory({ reportId: report.id, fromStatus: 'ESCALATED', toStatus: restore, notes: req.body.resolutionNotes, actorId: req.user.id });
        await notifyReportStatus(updated, restore, req.body.resolutionNotes);
      }
    }
    await db.createAuditLog({ actorId: req.user.id, action: 'RESOLVE_ESCALATION', entityType: 'ESCALATION', entityId: req.params.id, previousValue: { status: existing.status }, newValue: { status: escalation.status, resolutionNotes: escalation.resolutionNotes } });
    return res.status(200).json({ status: 'success', message: 'Escalation resolved successfully.', data: { escalation } });
  } catch (error) { next(error); }
};
export default { getEscalatedReports, getEscalation, getOverdueReports, autoEscalateOverdue, manuallyEscalate, resolveEscalation };
