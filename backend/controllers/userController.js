import bcrypt from 'bcryptjs';
import db from '../config/db.js';

const withoutPassword = (user) => {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
};

export const createUser = async (req, res, next) => {
  try {
    const { email, phone, password, county, subCounty, ward } = req.body;
    let { role, departmentId, countyId, subCountyId, wardId } = req.body;
    if (req.user.role !== 'SUPER_ADMIN') {
      if (['ADMIN','SUPER_ADMIN'].includes(role)) return res.status(403).json({ status: 'error', message: 'Only a super administrator can create platform administrators.' });
      if (req.user.departmentId) departmentId = req.user.departmentId;
    }
    if (departmentId && !await db.findDepartmentById(departmentId)) return res.status(400).json({ status: 'error', message: 'Choose an existing department.' });
    if (county) { const c = await db.findCountyByName(county); countyId = c?.id || countyId; }
    if (subCounty && countyId) { const sc = await db.findSubCountyByName(countyId, subCounty); subCountyId = sc?.id || subCountyId; }
    if (ward && subCountyId) { const w = await db.findWardByName(subCountyId, ward); wardId = w?.id || wardId; }

    if (await db.findUserByEmail(email)) {
      return res.status(409).json({
        status: 'error',
        message: 'A user with this email address already exists.',
      });
    }

    if (phone && (await db.findUserByPhone(phone))) {
      return res.status(409).json({
        status: 'error',
        message: 'A user with this phone number already exists.',
      });
    }

    const user = await db.createUser({
      name: req.body.name,
      email,
      phone,
      password: await bcrypt.hash(password, 12),
      role,
      county,
      subCounty,
      ward,
      departmentId,
      countyId, subCountyId, wardId,
      isVerified: true, emailVerified: true,
    });
    await db.createAuditLog({ actorId: req.user.id, action: 'USER_CREATED', entityType: 'USER', entityId: user.id, newValue: { role: user.role, departmentId: user.departmentId } });

    return res.status(201).json({
      status: 'success',
      message: 'User created successfully.',
      data: { user: withoutPassword(user) },
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const { role, isActive, departmentId, search } = req.validatedQuery || req.query;

    const scope = req.user.role === 'SUPER_ADMIN' ? {} : { departmentId: req.user.departmentId || '__unassigned__' };
    const users = await db.findUsers({ ...scope, role, isActive, ...(req.user.role === 'SUPER_ADMIN' ? { departmentId } : {}), search });

    return res.status(200).json({
      status: 'success',
      total: users.length,
      data: { users: users.map(withoutPassword) },
    });
  } catch (error) {
    next(error);
  }
};

export const getOfficers = async (req, res, next) => {
  try {
    const { departmentId, search } = req.validatedQuery || req.query;
    const user = req.user;

    // Build scope filter based on caller's jurisdiction
    let scopeFilter = {};
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'GOVERNOR') {
      // No scope — can see all officers
      scopeFilter = {};
    } else if (user.departmentId) {
      scopeFilter = { departmentId: user.departmentId };
    }

    // Merge with caller-provided filters (caller can't override their own scope)
    const filters = {
      ...scopeFilter,
      ...(departmentId && scopeFilter.departmentId ? {} : { departmentId }),
      ...(search && { search }),
    };

    const officers = await db.findUsers(filters);

    // Exclude CITIZEN roles — only government officers can be assigned
    const governmentOfficers = officers.filter((u) => u.role !== 'CITIZEN');

    return res.status(200).json({
      status: 'success',
      total: governmentOfficers.length,
      data: { officers: governmentOfficers.map(withoutPassword) },
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await db.findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
    }
    if (req.user.role !== 'SUPER_ADMIN' && user.departmentId !== req.user.departmentId) return res.status(403).json({ status: 'error', message: 'User is outside your department.' });
    return res.status(200).json({ status: 'success', data: { user: withoutPassword(user) } });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const existing = await db.findUserById(req.params.id);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      if (existing.departmentId !== req.user.departmentId || ['ADMIN','SUPER_ADMIN'].includes(existing.role) || (req.body.role && ['ADMIN','SUPER_ADMIN'].includes(req.body.role)) || (req.body.departmentId && req.body.departmentId !== req.user.departmentId)) return res.status(403).json({ status: 'error', message: 'You cannot modify this account or its permissions.' });
    }
    if (existing.id === req.user.id && (req.body.isActive === false || req.body.role && req.body.role !== existing.role)) return res.status(409).json({ status: 'error', message: 'You cannot deactivate or change your own role.' });
    const changedPermissions = req.body.role && req.body.role !== existing.role || req.body.isActive === false || req.body.departmentId !== undefined && req.body.departmentId !== existing.departmentId;
    const updatedUser = await db.updateUser(req.params.id, req.body);
    if (changedPermissions) await db.revokeAllUserRefreshTokens(existing.id);
    await db.createAuditLog({ actorId: req.user.id, action: 'USER_UPDATED', entityType: 'USER', entityId: existing.id, previousValue: { role: existing.role, isActive: existing.isActive, departmentId: existing.departmentId }, newValue: { role: updatedUser.role, isActive: updatedUser.isActive, departmentId: updatedUser.departmentId } });
    return res.status(200).json({
      status: 'success',
      message: 'User updated successfully.',
      data: { user: withoutPassword(updatedUser) },
    });
  } catch (error) {
    next(error);
  }
};

const setUserStatus = (isActive, message) => async (req, res, next) => {
  try {
    const user = await db.findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
    }
    if (req.user.role !== 'SUPER_ADMIN' && (user.departmentId !== req.user.departmentId || ['ADMIN','SUPER_ADMIN'].includes(user.role))) return res.status(403).json({ status: 'error', message: 'You cannot modify this account.' });
    if (user.id === req.user.id && !isActive) return res.status(409).json({ status: 'error', message: 'You cannot deactivate your own account.' });
    const updated = await db.updateUser(req.params.id, { isActive });
    if (!isActive) await db.revokeAllUserRefreshTokens(user.id);
    await db.createAuditLog({ actorId: req.user.id, action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entityType: 'USER', entityId: user.id, newValue: { isActive } });
    return res.status(200).json({
      status: 'success',
      message,
      data: { user: withoutPassword(updated) },
    });
  } catch (error) {
    next(error);
  }
};

export const activateUser = setUserStatus(true, 'User activated successfully.');
export const deactivateUser = setUserStatus(false, 'User deactivated successfully.');

export default {
  createUser,
  getUsers,
  getOfficers,
  getUser,
  updateUser,
  activateUser,
  deactivateUser,
};
