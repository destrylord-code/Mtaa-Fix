import jwt from 'jsonwebtoken';
import crypto from 'crypto';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change_in_production|super_secret/.test(process.env.JWT_SECRET))) {
  throw new Error('JWT_SECRET must be a strong random secret of at least 32 characters');
}
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32 || process.env.JWT_REFRESH_SECRET === process.env.JWT_SECRET || /change_in_production|super_secret/.test(process.env.JWT_REFRESH_SECRET))) {
  throw new Error('JWT_REFRESH_SECRET must be a separate strong random secret of at least 32 characters');
}
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn('WARNING: JWT_SECRET not set, using insecure default for development');
}

if (!process.env.JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET must be set in production');
  }
  console.warn('WARNING: JWT_REFRESH_SECRET not set, using insecure default for development');
}

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-super-secret-access-token-key-change-in-production';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-only-super-secret-refresh-token-key-change-in-production';
export const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '15m';
export const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    jwtid: crypto.randomBytes(16).toString('hex'),
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

export function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateOtpCode,
  generateSecureToken,
  cookieOptions,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};
