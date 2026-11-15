import { v4 as uuidv4 } from 'uuid';
import { createHash, createHmac } from 'node:crypto';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const hashCode = (value) => createHmac('sha256', process.env.JWT_SECRET || 'test-only-otp-key').update(value).digest('hex');
import { getPrismaClient, checkIsPrisma } from './client.js';
import { memoryStore } from './memoryStore.js';

export const tokenRepository = {
  async createAuthHandoff({ codeHash, userId, expiresAt }) {
    const record = {
      codeHash,
      userId,
      expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };

    if (checkIsPrisma()) {
      await getPrismaClient().authHandoff.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return getPrismaClient().authHandoff.create({
        data: { codeHash, userId, expiresAt },
      });
    }

    for (const [storedHash, handoff] of memoryStore.authHandoffs.entries()) {
      if (handoff.expiresAt < new Date()) {
        memoryStore.authHandoffs.delete(storedHash);
      }
    }
    memoryStore.authHandoffs.set(codeHash, record);
    return record;
  },

  async consumeAuthHandoff(codeHash, now = new Date()) {
    if (checkIsPrisma()) {
      const result = await getPrismaClient().authHandoff.updateMany({
        where: {
          codeHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });

      if (result.count !== 1) return null;

      return getPrismaClient().authHandoff.findUnique({
        where: { codeHash },
        include: { user: true },
      });
    }

    const record = memoryStore.authHandoffs.get(codeHash);
    if (!record || record.consumedAt || record.expiresAt <= now) return null;

    record.consumedAt = now;
    const user = memoryStore.users.get(record.userId);
    return { ...record, user: user ? { ...user } : null };
  },

  async createRefreshToken({ token, userId, expiresAt }) {
    const record = { id: uuidv4(), token: hash(token), userId, expiresAt, revokedAt: null, createdAt: new Date() };
    if (checkIsPrisma()) return getPrismaClient().refreshToken.create({ data: record });
    memoryStore.refreshTokens.set(record.token, record);
    return record;
  },

  async findRefreshToken(token) {
    if (!token) return null;
    const key = hash(token);
    if (checkIsPrisma()) return getPrismaClient().refreshToken.findUnique({ where: { token: key }, include: { user: true } });
    const record = memoryStore.refreshTokens.get(key);
    return record ? { ...record, user: memoryStore.users.get(record.userId) || null } : null;
  },

  async revokeRefreshToken(token) {
    if (!token) return false;
    const key = hash(token);
    if (checkIsPrisma()) {
      const result = await getPrismaClient().refreshToken.updateMany({
        where: { token: key, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() },
      });
      return result.count === 1;
    }
    const record = memoryStore.refreshTokens.get(key);
    if (!record || record.revokedAt || record.expiresAt <= new Date()) return false;
    record.revokedAt = new Date();
    return true;
  },

  async revokeAllUserRefreshTokens(userId) {
    if (!userId) return;
    if (checkIsPrisma()) {
      await getPrismaClient().refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return;
    }
    for (const item of memoryStore.refreshTokens.values()) if (item.userId === userId) item.revokedAt = new Date();
  },

  // ---------------- VERIFICATION TOKEN OPERATIONS ----------------
  async createVerificationToken({ identifier, code, token, type, userId, expiresAt }) {
    const id = uuidv4();
    const record = {
      id,
      identifier: identifier.toLowerCase().trim(),
      code: code ? hashCode(code) : null,
      token: hash(token),
      type: type || 'EMAIL',
      userId: userId || null,
      expiresAt,
      createdAt: new Date(),
    };

    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().verificationToken.create({
          data: {
            token: record.token,
            code: record.code,
            identifier: record.identifier,
            type: record.type,
            userId: record.userId,
            expiresAt: record.expiresAt,
          },
        });
      } catch (err) {
        throw err;
      }
    }

    memoryStore.verificationTokens.set(record.token, record);
    if (code) {
      memoryStore.verificationTokens.set(`${record.identifier}:${hashCode(code)}`, record);
    }
    return record;
  },

  async findVerificationToken({ identifier, token, code }) {
    if (checkIsPrisma()) {
      try {
        if (token) {
          return await getPrismaClient().verificationToken.findUnique({ where: { token: hash(token) } });
        }
        if (identifier && code) {
          return await getPrismaClient().verificationToken.findFirst({
            where: {
              identifier: identifier.toLowerCase().trim(),
              code: hashCode(code),
            },
          });
        }
      } catch (err) {
        throw err;
      }
    }

    if (token && memoryStore.verificationTokens.has(hash(token))) {
      return memoryStore.verificationTokens.get(hash(token));
    }

    if (identifier && code) {
      const key = `${identifier.toLowerCase().trim()}:${hashCode(code)}`;
      if (memoryStore.verificationTokens.has(key)) {
        return memoryStore.verificationTokens.get(key);
      }
    }

    for (const item of memoryStore.verificationTokens.values()) {
      if (token && item.token === hash(token)) return item;
      if (
        identifier &&
        code &&
        item.identifier === identifier.toLowerCase().trim() &&
        item.code === hashCode(code)
      ) {
        return item;
      }
    }

    return null;
  },

  async deleteVerificationToken(idOrToken) {
    if (checkIsPrisma()) {
      try {
        await getPrismaClient().verificationToken.deleteMany({
          where: {
            OR: [{ id: idOrToken }, { token: hash(idOrToken) }],
          },
        });
        return;
      } catch (err) {
        throw err;
      }
    }

    for (const [key, item] of memoryStore.verificationTokens.entries()) {
      if (item.id === idOrToken || item.token === hash(idOrToken)) {
        memoryStore.verificationTokens.delete(key);
      }
    }
  },

  // ---------------- PASSWORD RESET TOKEN OPERATIONS ----------------
  async createPasswordResetToken({ userId, token, expiresAt }) {
    const id = uuidv4();
    const record = { id, userId, token: hash(token), expiresAt, createdAt: new Date() };

    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().passwordResetToken.create({
          data: { token: hash(token), userId, expiresAt },
        });
      } catch (err) {
        throw err;
      }
    }

    memoryStore.passwordResetTokens.set(hash(token), record);
    return record;
  },

  async findPasswordResetToken(token) {
    if (!token) return null;

    if (checkIsPrisma()) {
      try {
        return await getPrismaClient().passwordResetToken.findUnique({
          where: { token: hash(token) },
          include: { user: true },
        });
      } catch (err) {
        throw err;
      }
    }

    const record = memoryStore.passwordResetTokens.get(hash(token));
    if (!record) return null;
    const user = memoryStore.users.get(record.userId);
    return { ...record, user: user ? { ...user } : null };
  },

  async consumePasswordResetToken(token) {
    const key = hash(token);
    if (checkIsPrisma()) {
      const result = await getPrismaClient().passwordResetToken.deleteMany({ where: { token: key, expiresAt: { gt: new Date() } } });
      return result.count === 1;
    }
    const record = memoryStore.passwordResetTokens.get(key);
    if (!record || record.expiresAt <= new Date()) return false;
    memoryStore.passwordResetTokens.delete(key);
    return true;
  },
  async deletePasswordResetTokensForUser(userId) {
    if (checkIsPrisma()) { await getPrismaClient().passwordResetToken.deleteMany({ where: { userId } }); return; }
    for (const [key, record] of memoryStore.passwordResetTokens) if (record.userId === userId) memoryStore.passwordResetTokens.delete(key);
  },
  async deletePasswordResetToken(token) {
    if (!token) return;

    if (checkIsPrisma()) {
      try {
        await getPrismaClient().passwordResetToken.deleteMany({
          where: { token: hash(token) },
        });
        return;
      } catch (err) {
        throw err;
      }
    }

    memoryStore.passwordResetTokens.delete(hash(token));
  },
};

export default tokenRepository;
