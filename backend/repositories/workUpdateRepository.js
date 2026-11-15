import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const workUpdateRepository = {
  async createWorkUpdate(data) {
    const workUpdate = {
      id: uuidv4(),
      reportId: data.reportId,
      officerId: data.officerId,
      note: data.note,
      mediaUrls: data.mediaUrls || [],
      status: data.status || 'IN_PROGRESS',
      createdAt: new Date(),
    };
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().workUpdate.create({ data: workUpdate , include: { report: true } });
      } catch (error) {
        throw error;
      }
    }
    memoryStore.workUpdates.set(workUpdate.id, workUpdate);
    return { ...workUpdate, report: memoryStore.reports.get(workUpdate.reportId) || null };
  },
  async findWorkUpdates({ reportId, officerId } = {}) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().workUpdate.findMany({
          where: {
            ...(reportId && { reportId }),
            ...(officerId && { officerId }),
          },
          orderBy: { createdAt: 'desc' }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    return [...memoryStore.workUpdates.values()]
      .filter((item) => (!reportId || item.reportId === reportId)
        && (!officerId || item.officerId === officerId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({ ...item, report: memoryStore.reports.get(item.reportId) || null }));
  },
  async findWorkUpdateById(id) {
    if (checkIsPrisma()) {
      try { return await getPrismaClient().workUpdate.findUnique({ where: { id }, include: { report: true } }); }
      catch (error) { throw error; }
    }
    const item = memoryStore.workUpdates.get(id); return item ? { ...item, report: memoryStore.reports.get(item.reportId) || null } : null;
  },
  async updateWorkUpdate(id, updateData) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().workUpdate.update({
          where: { id },
          data: updateData, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    const existing = memoryStore.workUpdates.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    memoryStore.workUpdates.set(id, updated);
    return { ...updated, report: memoryStore.reports.get(updated.reportId) || null };
  },
};

export default workUpdateRepository;
