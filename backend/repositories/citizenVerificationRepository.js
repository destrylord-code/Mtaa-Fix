import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const citizenVerificationRepository = {
  async createCitizenVerification(data) {
    const verification = {
      id: uuidv4(),
      reportId: data.reportId,
      officerId: data.officerId || null,
      citizenId: data.citizenId || null,
      outcome: data.outcome || 'CONFIRMED',
      evidence: data.evidence || null,
      notes: data.notes || null,
      createdAt: new Date(),
    };
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().citizenVerification.create({ data: verification });
      } catch (error) {
        throw error;
      }
    }
    memoryStore.citizenVerifications.set(verification.id, verification);
    return { ...verification };
  },
  async findVerificationByReportId(reportId) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().citizenVerification.findFirst({
          where: { reportId },
          orderBy: { createdAt: 'desc' },
        });
      } catch (error) {
        throw error;
      }
    }
    return [...memoryStore.citizenVerifications.values()]
      .filter((item) => item.reportId === reportId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  },
};

export default citizenVerificationRepository;
