import db from '../config/db.js';
import { canAccessReport } from '../services/jurisdiction.js';
import { isValidTransition, recordStatusHistory } from '../services/statusWorkflow.js';
import { notifyUser } from '../services/notifyService.js';
import { sanitizeReport } from '../services/reportValidation.js';

const ASSIGNABLE = new Set(['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'REOPENED', 'ESCALATED']);
async function assign(req, res, next, reassign = false) {
  try {
    const reportId = reassign ? req.params.reportId : req.body.reportId;
    const { officerId, reason } = req.body;
    const report = await db.findReportById(reportId);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    if (!canAccessReport(req.user, report)) return res.status(403).json({ status: 'error', message: 'Report is outside your jurisdiction.' });
    if (!ASSIGNABLE.has(report.status) || (report.status !== 'ASSIGNED' && !isValidTransition(report.status, 'ASSIGNED'))) {
      return res.status(409).json({ status: 'error', message: `A report in ${report.status} cannot be assigned.` });
    }
    const officer = await db.findUserById(officerId);
    if (!officer?.isActive || !['OFFICER', 'FIELD_OFFICER'].includes(officer.role)) return res.status(400).json({ status: 'error', message: 'Choose an active field officer.' });
    if (report.departmentId && officer.departmentId !== report.departmentId) return res.status(400).json({ status: 'error', message: 'The officer must belong to the report department.' });
    if (!reassign && report.assignedOfficerId === officerId) return res.status(409).json({ status: 'error', message: 'This officer is already assigned.' });
    const updated = await db.transitionReport(reportId, report.status, { assignedOfficerId: officerId, status: 'ASSIGNED' });
    if (!updated) return res.status(409).json({ status: 'error', message: 'The report changed. Refresh and try again.' });
    const assignment = await db.createAssignment({ reportId, officerId, assignedById: req.user.id, reason, status: 'ASSIGNED' });
    await recordStatusHistory({ reportId, fromStatus: report.status, toStatus: 'ASSIGNED', notes: reason || `Assigned to ${officer.name}`, actorId: req.user.id });
    await db.createAuditLog({ actorId: req.user.id, action: reassign ? 'REPORT_REASSIGNED' : 'REPORT_ASSIGNED', entityType: 'REPORT', entityId: reportId,
      previousValue: { assignedOfficerId: report.assignedOfficerId, status: report.status }, newValue: { assignedOfficerId: officerId, status: 'ASSIGNED', reason } });
    await notifyUser(officerId, 'New report assignment', `Report ${updated.referenceCode || reportId} has been assigned to you.`, 'INFO');
    return res.status(reassign ? 200 : 201).json({ status: 'success', message: `Report ${reassign ? 'reassigned' : 'assigned'} successfully.`, data: { assignment, report: sanitizeReport(updated, req.user) } });
  } catch (error) { next(error); }
}
export const assignReport = (req, res, next) => assign(req, res, next);
export const reassignReport = (req, res, next) => assign(req, res, next, true);
export const getAssignments = async (req, res, next) => {
  try {
    const assignments = await db.findAssignments(req.validatedQuery || {});
    const reports = new Map();
    for (const item of assignments) if (!reports.has(item.reportId)) reports.set(item.reportId, await db.findReportById(item.reportId));
    const scoped = assignments.filter((item) => canAccessReport(req.user, reports.get(item.reportId)));
    return res.status(200).json({ status: 'success', total: scoped.length, data: { assignments: scoped } });
  } catch (error) { next(error); }
};
export const getAssignmentHistory = async (req, res, next) => {
  try {
    const report = await db.findReportById(req.params.reportId);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    if (!canAccessReport(req.user, report)) return res.status(403).json({ status: 'error', message: 'Report is outside your jurisdiction.' });
    const assignments = await db.findAssignments({ reportId: report.id });
    return res.status(200).json({ status: 'success', total: assignments.length, data: { assignments } });
  } catch (error) { next(error); }
};
export default { assignReport, reassignReport, getAssignments, getAssignmentHistory };
