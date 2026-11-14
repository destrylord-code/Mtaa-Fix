import { randomUUID } from 'node:crypto';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

export const attachmentRepository = {
  async createAttachment(data) {
    const record = { id: randomUUID(), reportId: null, ...data, createdAt: new Date() };
    if (checkIsPrisma()) return getPrismaClient().reportAttachment.create({ data: {
      reportId: record.reportId, ownerId: record.ownerId, url: record.url,
      name: record.name, mimeType: record.mimeType, sizeBytes: record.sizeBytes,
    } });
    memoryStore.attachments.set(record.url, record);
    return record;
  },
  async findAttachmentByUrl(url) {
    if (checkIsPrisma()) return getPrismaClient().reportAttachment.findUnique({ where: { url } });
    return memoryStore.attachments.get(url) || null;
  },
  async attachMediaToReport(urls, reportId, ownerId) {
    if (!urls.length) return;
    if (checkIsPrisma()) {
      await getPrismaClient().reportAttachment.updateMany({ where: { url: { in: urls }, ownerId, reportId: null }, data: { reportId } });
      return;
    }
    for (const url of urls) {
      const item = memoryStore.attachments.get(url);
      if (item?.ownerId === ownerId && !item.reportId) item.reportId = reportId;
    }
  },
};
export default attachmentRepository;
