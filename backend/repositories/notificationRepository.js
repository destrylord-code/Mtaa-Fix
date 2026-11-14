import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

const notificationRepository = {
  async createNotification(data) {
    const notification = {
      id: uuidv4(), userId: data.userId, title: data.title, message: data.message,
      type: data.type || 'INFO', isRead: false, createdAt: new Date(), updatedAt: new Date(),
    };
    if (checkIsPrisma()) {
      try { return await getPrismaClient().notification.create({ data: notification }); }
      catch (error) { throw error; }
    }
    memoryStore.notifications.set(notification.id, notification);
    return { ...notification };
  },
  async findNotifications(userId, unreadOnly = false) {
    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().notification.findMany({
          where: { userId, ...(unreadOnly && { isRead: false }) },
          orderBy: { createdAt: 'desc' },
        });
      } catch (error) { throw error; }
    }
    return [...memoryStore.notifications.values()]
      .filter((item) => item.userId === userId && (!unreadOnly || !item.isRead))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  async updateNotification(id, userId, data) {
    if (checkIsPrisma()) {
      try { const result = await getPrismaClient().notification.updateMany({ where: { id, userId }, data }); return result.count ? { id, userId, ...data } : null; }
      catch (error) { throw error; }
    }
    const notification = memoryStore.notifications.get(id);
    if (!notification || notification.userId !== userId) return null;
    const updated = { ...notification, ...data, updatedAt: new Date() };
    memoryStore.notifications.set(id, updated);
    return { ...updated };
  },
  async markAllAsRead(userId) {
    if (checkIsPrisma()) {
      try { return await getPrismaClient().notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } }); }
      catch (error) { throw error; }
    }
    let count = 0;
    for (const item of memoryStore.notifications.values()) {
      if (item.userId === userId && !item.isRead) { item.isRead = true; item.updatedAt = new Date(); count += 1; }
    }
    return { count };
  },
  async deleteNotification(id, userId) {
    if (checkIsPrisma()) {
      try { return (await getPrismaClient().notification.deleteMany({ where: { id, userId } })).count > 0; }
      catch (error) { throw error; }
    }
    const item = memoryStore.notifications.get(id);
    return Boolean(item && item.userId === userId && memoryStore.notifications.delete(id));
  },
};

export default notificationRepository;
