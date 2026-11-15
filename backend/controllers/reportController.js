import db from '../config/db.js';
import PDFDocument from 'pdfkit';
import { isValidTransition, recordStatusHistory, getStatusHistory } from '../services/statusWorkflow.js';
import { applyRoutingRules } from '../services/routingEngine.js';
import { notifyUser, notifyReportStatus } from '../services/notifyService.js';
import { findPossibleDuplicates } from '../services/duplicateDetection.js';
import { canAccessReport, canChangeStatus, canPerformTransition, scopeReportQuery } from '../services/jurisdiction.js';

import { resolveReportFields, assertOwnedMedia, validateMediaUrls, sanitizeReport } from '../services/reportValidation.js';

const extractMediaUrls = (req) => {
  let urls = [];
  if (Array.isArray(req.body?.mediaUrls)) {
    urls = [...req.body.mediaUrls];
  } else if (typeof req.body?.mediaUrls === 'string') {
    try {
      const parsed = JSON.parse(req.body.mediaUrls);
      if (Array.isArray(parsed)) urls = [...parsed];
    } catch (e) {
      urls.push(req.body.mediaUrls);
    }
  }

  if (req.files && Array.isArray(req.files)) {
    const fileUrls = (req.uploadedMedia || []).map((file) => file.url);
    urls = [...urls, ...fileUrls];
  }

  return [...new Set(urls)];
};
export const createReport = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      subCategory,
      priority = 'MEDIUM',
      location,
      county,
      subCounty,
      ward,
      latitude,
      longitude,
      isAnonymous = false,
      departmentId,
    } = req.body;

    const mediaUrls = extractMediaUrls(req);

    if (!req.user.isVerified && !req.user.emailVerified) {
      return res.status(403).json({ status: 'error', message: 'Verify your email before submitting a report.' });
    }
    await assertOwnedMedia(mediaUrls, req.user.id);
    const locationFields = await resolveReportFields(req.body);

    const newReport = await db.createReport({
      title,
      description,
      ...locationFields,
      category: locationFields.category || category,
      subCategory: locationFields.subCategory ?? subCategory,
      priority,
      status: 'SUBMITTED',
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      mediaUrls,
      isAnonymous: Boolean(isAnonymous === true || isAnonymous === 'true' || isAnonymous === '1'),
      reporterId: req.user.id,
      location: location || null,
    });

    await db.attachMediaToReport(mediaUrls, newReport.id, req.user.id);
    const routedReport = await applyRoutingRules(newReport);

    await recordStatusHistory({
      reportId: newReport.id,
      fromStatus: null,
      toStatus: 'SUBMITTED',
      notes: 'Report submitted',
      actorId: req.user.id,
    });

    if (routedReport.status !== newReport.status) {
      await recordStatusHistory({
        reportId: newReport.id,
        fromStatus: 'SUBMITTED',
        toStatus: routedReport.status,
        notes: 'Auto-routed to officer',
        actorId: req.user.id,
      });
    }

    await notifyUser(
      newReport.reporterId,
      'Report submitted',
      'Your report was submitted successfully and is awaiting review.',
      'INFO'
    );

    await db.createAuditLog({
      actorId: req.user.id,
      action: 'REPORT_CREATED',
      entityType: 'REPORT',
      entityId: newReport.id,
      newValue: { status: routedReport.status, category: newReport.category },
    });

    const possibleDuplicates = await findPossibleDuplicates({
      title,
      category,
      ward,
      excludeId: newReport.id,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Report submitted successfully. Authorities will review it shortly.',
      data: {
        report: sanitizeReport(routedReport, req.user),
        possibleDuplicates,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createGuestReport = async (req, res, next) => {
  try {
    const fields = await resolveReportFields(req.body);
    const report = await db.createReport({ ...req.body, ...fields, mediaUrls: [], status: 'SUBMITTED', isAnonymous: true, reporterId: null });
    const routed = await applyRoutingRules(report);
    await recordStatusHistory({ reportId: report.id, fromStatus: null, toStatus: routed.status, notes: 'Anonymous report submitted' });
    await db.createAuditLog({ action: 'GUEST_REPORT_CREATED', entityType: 'REPORT', entityId: report.id, newValue: { status: routed.status, category: routed.category } });
    return res.status(201).json({ status: 'success', message: 'Your anonymous report was submitted successfully.', data: { report: sanitizeReport(routed) } });
  } catch (error) { next(error); }
};

export const getReports = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      priority,
      category,
      ward,
    } = req.validatedQuery || req.query;

    const data = await db.findReports(scopeReportQuery(req.user, {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      priority,
      category,
      ward,
    }));

    data.reports = data.reports.map((r) => sanitizeReport(r, req.user));

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await db.findReportById(id);

    if (!report) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    if (!canAccessReport(req.user, report)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Report is outside your jurisdiction.',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        report: sanitizeReport(report, req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getReportHistory = async (req, res, next) => {
  try {
    const report = await db.findReportById(req.params.id);
    if (!report) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }
    if (!canAccessReport(req.user, report)) return res.status(403).json({ status: 'error', message: 'Forbidden: Report is outside your jurisdiction.' });
    const history = await getStatusHistory(req.params.id);
    return res.status(200).json({
      status: 'success',
      data: { history },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyReports = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
    } = req.validatedQuery || req.query;

    const data = await db.findReports({
      reporterId: req.user.id,
      status,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    data.reports = data.reports.map((r) => sanitizeReport(r, req.user));

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.findReportById(id);

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    const isReporter = existing.reporterId === req.user.id;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isReporter && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: You do not have permission to edit this report.',
      });
    }

    // Citizens can only update reports in SUBMITTED or UNDER_REVIEW status
    if (isReporter && !isAdmin && !['SUBMITTED', 'UNDER_REVIEW'].includes(existing.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Report is currently '${existing.status}' and cannot be edited by citizen.`,
      });
    }

    const {
      title,
      description,
      category,
      subCategory,
      priority,
      location,
      county,
      subCounty,
      ward,
      latitude,
      longitude,
      isAnonymous,
    } = req.body;

    const uploadedUrls = extractMediaUrls(req);
    const updatedMedia = uploadedUrls.length > 0 ? uploadedUrls : undefined;

    const updatePayload = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(subCategory !== undefined && { subCategory }),
      ...(priority !== undefined && { priority }),
      ...(location !== undefined && { location }),
      ...(county !== undefined && { county }),
      ...(subCounty !== undefined && { subCounty }),
      ...(ward !== undefined && { ward }),
      ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
      ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
      ...(isAnonymous !== undefined && {
        isAnonymous: Boolean(isAnonymous === true || isAnonymous === 'true' || isAnonymous === '1'),
      }),
      ...(updatedMedia && { mediaUrls: updatedMedia }),
    };

    const newMedia = (updatedMedia || []).filter((url) => !(existing.mediaUrls || []).includes(url));
    await assertOwnedMedia(newMedia, req.user.id, id);
    if (updatedMedia) validateMediaUrls(updatedMedia);
    const resolved = await resolveReportFields(updatePayload, existing);
    const updated = await db.updateReport(id, { ...updatePayload, ...resolved });
    await db.attachMediaToReport(newMedia, id, req.user.id);

    return res.status(200).json({
      status: 'success',
      message: 'Report updated successfully.',
      data: {
        report: sanitizeReport(updated, req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};
export const deleteReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.findReportById(id);

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    const isReporter = existing.reporterId === req.user.id;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isReporter && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: You do not have permission to delete this report.',
      });
    }

    if (isReporter && !isAdmin && existing.status !== 'SUBMITTED') {
      return res.status(400).json({
        status: 'error',
        message: 'You can only delete reports that are still in SUBMITTED status.',
      });
    }

    await db.deleteReport(id);

    return res.status(200).json({
      status: 'success',
      message: 'Report deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};
export const changeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      status,
      notes,
      resolutionNotes,
      assignedOfficerId,
      departmentId,
      resolutionMediaUrls,
    } = req.body;

    const existing = await db.findReportById(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }
    if (!canChangeStatus(req.user)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Only operational roles can update report status.',
      });
    }

    if (!canAccessReport(req.user, existing)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Report is outside your jurisdiction.',
      });
    }

    if (!isValidTransition(existing.status, status)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status transition from '${existing.status}' to '${status}'.`,
      });
    }

    if (!canPerformTransition(req.user, existing.status, status)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden: Role '${req.user.role}' cannot transition report from '${existing.status}' to '${status}'.`,
      });
    }

    if (departmentId && departmentId !== existing.departmentId && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Only an administrator may reroute a report to another department.' });
    }
    if (assignedOfficerId) {
      const officer = await db.findUserById(assignedOfficerId);
      if (!officer?.isActive || officer.role === 'CITIZEN' || (req.user.departmentId && officer.departmentId !== req.user.departmentId)) {
        return res.status(400).json({ status: 'error', message: 'Choose an active officer in the report department.' });
      }
    }
    validateMediaUrls(resolutionMediaUrls || []);
    const isResolving = status === 'RESOLVED';
    const finalResolutionNotes = resolutionNotes || notes;

    const updatePayload = {
      status,
      ...(assignedOfficerId && { assignedOfficerId }),
      ...(departmentId && { departmentId }),
      ...(finalResolutionNotes && { resolutionNotes: finalResolutionNotes }),
      ...(resolutionMediaUrls && { resolutionMediaUrls }),
      ...(isResolving && {
        resolvedAt: new Date(),
        resolutionStatus: 'PENDING', // Awaiting citizen acceptance
      }),
    };

    const updated = await db.transitionReport(id, existing.status, updatePayload);
    if (!updated) return res.status(409).json({ status: 'error', message: 'The report changed. Refresh and try again.' });

    await recordStatusHistory({
      reportId: id,
      fromStatus: existing.status,
      toStatus: status,
      notes: finalResolutionNotes,
      actorId: req.user.id,
    });

    await notifyReportStatus(updated, status, finalResolutionNotes);

    await db.createAuditLog({
      actorId: req.user.id,
      action: 'REPORT_STATUS_CHANGED',
      entityType: 'REPORT',
      entityId: id,
      previousValue: { status: existing.status },
      newValue: { status },
    });

    return res.status(200).json({
      status: 'success',
      message: `Report status updated to '${status}'.`,
      data: {
        report: sanitizeReport(updated, req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptResolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { feedback, rating } = req.body;

    const existing = await db.findReportById(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    const isReporter = existing.reporterId === req.user.id;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isReporter && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Only the reporting citizen can accept this resolution.',
      });
    }

    if (existing.status !== 'RESOLVED') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot accept resolution: Report status is '${existing.status}', not 'RESOLVED'.`,
      });
    }

    const updated = await db.transitionReport(id, existing.status, {
      status: 'CLOSED',
      resolutionStatus: 'ACCEPTED',
      citizenFeedback: feedback || (rating ? `Rated ${rating}/5` : 'Resolution accepted by citizen.'),
    });

    if (!updated) return res.status(409).json({ status: 'error', message: 'This resolution has already been reviewed.' });
    await db.createCitizenVerification({
      reportId: id,
      officerId: null,
      citizenId: req.user.id,
      outcome: 'CONFIRMED',
      evidence: null,
      notes: feedback || 'Resolution accepted by citizen.',
    });

    await recordStatusHistory({ reportId: id, fromStatus: existing.status, toStatus: 'CLOSED', notes: feedback || 'Resolution accepted by citizen', actorId: req.user.id });
    await db.createAuditLog({ actorId: req.user.id, action: 'REPORT_RESOLUTION_ACCEPTED', entityType: 'REPORT', entityId: id, previousValue: { status: existing.status }, newValue: { status: 'CLOSED', rating } });
    await notifyReportStatus(updated, 'CLOSED', feedback);
    return res.status(200).json({
      status: 'success',
      message: 'Resolution accepted. Thank you for confirming the fix!',
      data: {
        report: sanitizeReport(updated, req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};
export const rejectResolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, feedback } = req.body;
    const rejectionReason = reason || feedback;

    if (!rejectionReason) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a reason why the resolution is unsatisfactory.',
      });
    }

    const existing = await db.findReportById(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    const isReporter = existing.reporterId === req.user.id;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isReporter && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Only the reporting citizen can reject this resolution.',
      });
    }

    if (existing.status !== 'RESOLVED') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot reject resolution: Report status is '${existing.status}', not 'RESOLVED'.`,
      });
    }

    const reopened = await db.transitionReport(id, existing.status, { status: 'REOPENED', resolutionStatus: 'REJECTED', rejectionReason });
    if (!reopened) return res.status(409).json({ status: 'error', message: 'This resolution has already been reviewed.' });
    await recordStatusHistory({ reportId: id, fromStatus: existing.status, toStatus: 'REOPENED', notes: rejectionReason, actorId: req.user.id });
    const updated = await db.updateReport(id, {
      status: 'IN_PROGRESS',
      resolutionStatus: 'REJECTED',
      rejectionReason,
    });

    await db.createCitizenVerification({
      reportId: id,
      officerId: null,
      citizenId: req.user.id,
      outcome: 'REJECTED',
      evidence: null,
      notes: `Resolution rejected by citizen: ${rejectionReason}`,
    });

    await recordStatusHistory({
      reportId: id,
      fromStatus: 'REOPENED',
      toStatus: 'IN_PROGRESS',
      notes: `Resolution rejected: ${rejectionReason}`,
      actorId: req.user.id,
    });
    await notifyReportStatus(updated, 'IN_PROGRESS', `Resolution rejected: ${rejectionReason}`);

    await db.createAuditLog({
      actorId: req.user.id,
      action: 'REPORT_RESOLUTION_REJECTED',
      entityType: 'REPORT',
      entityId: id,
      previousValue: { status: existing.status },
      newValue: { status: 'IN_PROGRESS', rejectionReason },
    });

    return res.status(200).json({
      status: 'success',
      message: 'Resolution rejected. The report has been re-opened for further action.',
      data: {
        report: sanitizeReport(updated, req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};
export const partialResolution = async (req, res, next) => {
  try {
    const report = await db.findReportById(req.params.id);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    if (report.reporterId !== req.user.id) return res.status(403).json({ status: 'error', message: 'Only the reporting citizen can verify this resolution.' });
    if (report.status !== 'RESOLVED') return res.status(409).json({ status: 'error', message: 'This report is not awaiting verification.' });
    const updated = await db.transitionReport(report.id, 'RESOLVED', { status: 'REOPENED', resolutionStatus: 'PARTIAL', rejectionReason: req.body.reason });
    if (!updated) return res.status(409).json({ status: 'error', message: 'This resolution has already been reviewed.' });
    await db.createCitizenVerification({ reportId: report.id, citizenId: req.user.id, outcome: 'PARTIAL', notes: req.body.reason });
    await recordStatusHistory({ reportId: report.id, fromStatus: 'RESOLVED', toStatus: 'REOPENED', notes: `Partial resolution: ${req.body.reason}`, actorId: req.user.id });
    await db.createAuditLog({ actorId: req.user.id, action: 'REPORT_RESOLUTION_PARTIAL', entityType: 'REPORT', entityId: report.id, previousValue: { status: 'RESOLVED' }, newValue: { status: 'REOPENED', reason: req.body.reason } });
    await notifyReportStatus(updated, 'REOPENED', req.body.reason);
    return res.status(200).json({ status: 'success', message: 'Partial resolution recorded. The report has been reopened.', data: { report: sanitizeReport(updated, req.user) } });
  } catch (error) { next(error); }
};

export const searchReports = async (req, res, next) => {
  try {
    const { q, query, page = 1, limit = 10 } = req.validatedQuery || req.query;
    const searchTerm = q || query;

    if (!searchTerm) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query parameter (q) is required.',
      });
    }

    const data = await db.findReports(scopeReportQuery(req.user, {
      search: searchTerm,
      page,
      limit,
    }));

    data.reports = data.reports.map((r) => sanitizeReport(r, req.user));

    return res.status(200).json({
      status: 'success',
      query: searchTerm,
      data,
    });
  } catch (error) {
    next(error);
  }
};
export const filterReports = async (req, res, next) => {
  try {
    const {
      status,
      priority,
      category,
      subCategory,
      ward,
      county,
      subCounty,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.validatedQuery || req.query;

    const data = await db.findReports(scopeReportQuery(req.user, {
      status,
      priority,
      category,
      subCategory,
      ward,
      county,
      subCounty,
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      sortOrder,
    }));

    data.reports = data.reports.map((r) => sanitizeReport(r, req.user));

    return res.status(200).json({
      status: 'success',
      filters: {
        status,
        priority,
        category,
        subCategory,
        ward,
        county,
        subCounty,
        startDate,
        endDate,
      },
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getReportDownload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await db.findReportById(id);

    if (!report) {
      return res.status(404).json({
        status: 'error',
        message: 'Report not found.',
      });
    }

    if (!canAccessReport(req.user, report)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Report is outside your jurisdiction.',
      });
    }

    const rep = sanitizeReport(report, req.user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mtaa-fix-report-${rep.referenceCode || rep.id}.pdf"`
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Mtaa Fix — Citizen Portal', {
      align: 'center',
    });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text('Report Details', { align: 'center' });
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Report Reference:');
    doc.font('Helvetica').text(rep.id || 'N/A');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Title:');
    doc.font('Helvetica').text(rep.title || 'Not specified');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Description:');
    doc.font('Helvetica').text(rep.description || 'No description provided.');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Category:');
    doc.font('Helvetica').text(rep.category || 'Not specified');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Location:');
    doc.font('Helvetica').text(rep.location || 'Not specified');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Status:');
    doc.font('Helvetica').text(rep.status || 'Submitted');
    doc.moveDown();

    if (rep.createdAt || rep.date) {
      doc.font('Helvetica-Bold').text('Date Submitted:');
      doc.font('Helvetica').text(
        new Date(rep.createdAt || rep.date).toLocaleDateString('en-US')
      );
      doc.moveDown();
    }

    if (rep.department) {
      doc.font('Helvetica-Bold').text('Department:');
      doc.font('Helvetica').text(rep.department);
      doc.moveDown();
    }

    doc.end();
  } catch (error) {
    next(error);
  }
};

export default {
  createReport,
  getReports,
  getReport,
  getReportDownload,
  getMyReports,
  updateReport,
  deleteReport,
  changeStatus,
  acceptResolution,
  rejectResolution,
  partialResolution,
  searchReports,
  filterReports,
};
