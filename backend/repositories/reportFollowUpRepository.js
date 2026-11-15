import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const reportFollowUpRepository = {
  async createFollowUp(data) {
    const followUp = {
      id: uuidv4(),
      reportId: data.reportId,
      createdById: data.createdById,
      type: data.type || 'NOTE',
      note: data.note,
      createdAt: new Date(),
    };
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().reportFollowUp.create({ data: followUp , include: { report: true } });
      } catch (error) {
        throw error;
      }
    }
    memoryStore.reportFollowUps.set(followUp.id, followUp);
    return { ...followUp, report: memoryStore.reports.get(followUp.reportId) || null };
  },
  async findFollowUps({ reportId, createdById, type } = {}) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().reportFollowUp.findMany({
          where: {
            ...(reportId && { reportId }),
            ...(createdById && { createdById }),
            ...(type && { type }),
          },
          orderBy: { createdAt: 'desc' }, include: { report: true },
        });
      } catch (error) {
        throw error;
      }
    }
    return [...memoryStore.reportFollowUps.values()]
      .filter((item) => (!reportId || item.reportId === reportId)
        && (!createdById || item.createdById === createdById)
        && (!type || item.type === type))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({ ...item, report: memoryStore.reports.get(item.reportId) || null }));
  },
  async findFollowUpById(id) {
    if (checkIsPrisma()) {
      try { return await getPrismaClient().reportFollowUp.findUnique({ where: { id }, include: { report: true } }); }
      catch (error) { throw error; }
    }
    return memoryStore.reportFollowUps.get(id) || null;
  },
};

export default reportFollowUpRepository;
