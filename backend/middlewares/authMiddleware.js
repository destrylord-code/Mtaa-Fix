import db from '../config/db.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies) {
      // 2. Check cookies. Each frontend writes its session under a role-specific
      // name (government/admin/citizen). API calls normally use the Bearer
      // header, but cookie-only requests — e.g. <img src="/uploads/..."> served
      // through the same-origin Next.js proxy — rely on these. 'accessToken' is
      // kept as a legacy fallback for older clients.
      token =
        req.cookies['crs_government_access_token'] ??
        req.cookies['crs_admin_access_token'] ??
        req.cookies['crs_citizen_access_token'] ??
        req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. No token provided.',
      });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired access token.',
      });
    }
    const user = await db.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        status: 'error',
        message: 'Account has been deactivated. Please contact support.',
      });
    }

    const { password, ...safeUser } = user;
    req.user = safeUser;

    next();
  } catch (error) {
    next(error);
  }
};

export const protect = authenticate;
export const authMiddleware = authenticate;

export default {
  authenticate,
  protect,
  authMiddleware,
};
