import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const resolutionRepository = {
  async createResolutionSubmission(data) {
    const submission = {
      id: uuidv4(),
      reportId: data.reportId,
      submittedById: data.submittedById,
      status: data.status || 'PENDING',
      notes: data.notes || null,
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : [],
      resolvedAt: data.resolvedAt || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().resolutionSubmission.create({ data: submission , include: { report: true } });
      } catch (error) {
        throw error;
      }
    }
    memoryStore.resolutionSubmissions.set(submission.id, submission);
    return { ...submission, report: memoryStore.reports.get(submission.reportId) || null };
  },
  async findResolutionSubmissions({ reportId, submittedById } = {}) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().resolutionSubmission.findMany({
          where: {
            ...(reportId && { reportId }),
            ...(submittedById && { submittedById }),
          },
          orderBy: { createdAt: 'desc' }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    return [...memoryStore.resolutionSubmissions.values()]
      .filter((item) => (!reportId || item.reportId === reportId)
        && (!submittedById || item.submittedById === submittedById))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({ ...item, report: memoryStore.reports.get(item.reportId) || null }));
  },
  async findResolutionSubmissionById(id) {
    if (checkIsPrisma()) {
      try { return await getPrismaClient().resolutionSubmission.findUnique({ where: { id }, include: { report: true } }); }
      catch (error) { throw error; }
    }
    return memoryStore.resolutionSubmissions.get(id) || null;
  },
  async updateResolutionSubmission(id, updateData) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().resolutionSubmission.update({
          where: { id },
          data: { ...updateData, updatedAt: new Date() }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    const existing = memoryStore.resolutionSubmissions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    memoryStore.resolutionSubmissions.set(id, updated);
    return { ...updated, report: memoryStore.reports.get(updated.reportId) || null };
  },
};

export default resolutionRepository;
