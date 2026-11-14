import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const fieldInspectionRepository = {
  async createInspection(data) {
    const inspection = {
      id: uuidv4(),
      reportId: data.reportId,
      officerId: data.officerId,
      findings: data.findings || null,
      actionTaken: data.actionTaken || null,
      status: data.status || 'PENDING',
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().fieldInspection.create({ data: inspection , include: { report: true } });
      } catch (error) {
        throw error;
      }
    }
    memoryStore.fieldInspections.set(inspection.id, inspection);
    return { ...inspection, report: memoryStore.reports.get(inspection.reportId) || null };
  },
  async findInspections({ reportId, officerId, status } = {}) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().fieldInspection.findMany({
          where: {
            ...(reportId && { reportId }),
            ...(officerId && { officerId }),
            ...(status && { status }),
          },
          orderBy: { createdAt: 'desc' }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    return [...memoryStore.fieldInspections.values()]
      .filter((item) => (!reportId || item.reportId === reportId)
        && (!officerId || item.officerId === officerId)
        && (!status || item.status === status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({ ...item, report: memoryStore.reports.get(item.reportId) || null }));
  },
  async findInspectionById(id) {
    if (checkIsPrisma()) {
      try { return await getPrismaClient().fieldInspection.findUnique({ where: { id }, include: { report: true } }); }
      catch (error) { throw error; }
    }
    return memoryStore.fieldInspections.get(id) || null;
  },
  async updateInspection(id, updateData, actorId) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().fieldInspection.update({
          where: { id },
          data: { ...updateData, updatedAt: new Date() }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    const existing = memoryStore.fieldInspections.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    memoryStore.fieldInspections.set(id, updated);
    return { ...updated, report: memoryStore.reports.get(updated.reportId) || null };
  },
};

export default fieldInspectionRepository;
