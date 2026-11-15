import db from '../config/db.js';
import { canSeeReporterIdentity } from './jurisdiction.js';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const normalize = (value) => String(value || '').trim().toLowerCase();

export function validateMediaUrls(urls = []) {
  if (urls.length > 5) throw fail('Attach at most five evidence files.');
  for (const value of urls) {
    if (/^\/uploads\/report-[a-zA-Z0-9.-]+$/.test(value)) continue;
    let url;
    try { url = new URL(value); } catch { throw fail('Evidence must be an uploaded file or a valid HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw fail('Evidence URLs must use HTTPS.');
    if (process.env.CLOUDINARY_CLOUD_NAME && url.hostname === 'res.cloudinary.com' && url.pathname.startsWith(`/${process.env.CLOUDINARY_CLOUD_NAME}/`)) continue;
    throw fail('Use evidence uploaded through Mtaa Fix.');
  }
}

export async function assertOwnedMedia(urls, userId, allowedReportId = null) {
  validateMediaUrls(urls);
  for (const url of urls.filter((value) => value.startsWith('/uploads/'))) {
    const attachment = await db.findAttachmentByUrl(url);
    if (!attachment || attachment.ownerId !== userId || (attachment.reportId && attachment.reportId !== allowedReportId)) {
      throw fail('Evidence file was not uploaded by this account for this report.', 403);
    }
  }
}

/** Resolve canonical taxonomy/geography names and IDs on the server. */
export async function resolveReportFields(body, existing = null) {
  const value = (key) => body[key] !== undefined ? body[key] : existing?.[key];
  const result = {};
  const categories = await db.findCategories({ isActive: true, includeSubcategories: true });
  if (!categories.length && process.env.NODE_ENV === 'production') throw fail('The service catalog has not been configured.', 503);
  const categoryName = value('category');
  const category = categories.find((item) => normalize(item.name) === normalize(categoryName) || normalize(item.code) === normalize(categoryName));
  if (categories.length && !category) throw fail('Choose an active service category.');
  if (category) {
    result.category = category.name;
    result.categoryId = category.id;
    const categoryUnchanged = existing && normalize(existing.category) === normalize(category.name) && body.category === undefined;
    result.departmentId = categoryUnchanged ? (existing.departmentId ?? category.departmentId ?? null) : (category.departmentId || null);
    const subName = value('subCategory');
    if (subName) {
      const sub = category.subcategories?.find((item) => normalize(item.name) === normalize(subName) || normalize(item.code) === normalize(subName));
      if (!sub || sub.isActive === false) throw fail('Choose an active subcategory in the selected category.');
      result.subCategory = sub.name;
      result.subcategoryId = sub.id;
    } else { result.subCategory = null; result.subcategoryId = null; }
  }
  const countyName = value('county');
  const subName = value('subCounty');
  const wardName = value('ward');
  result.county = countyName || null; result.subCounty = subName || null; result.ward = wardName || null;
  result.countyId = null; result.subCountyId = null; result.wardId = null;
  if (countyName) {
    const county = await db.findCountyByName(countyName);
    if (county) {
      result.county = county.name; result.countyId = county.id;
      if (subName) {
        const sub = await db.findSubCountyByName(county.id, subName);
        if (!sub) throw fail('Choose a sub-county within the selected county.');
        result.subCounty = sub.name; result.subCountyId = sub.id;
        if (wardName) {
          const ward = await db.findWardByName(sub.id, wardName);
          if (!ward) throw fail('Choose a ward within the selected sub-county.');
          result.ward = ward.name; result.wardId = ward.id;
        }
      } else if (wardName) throw fail('Choose a county and sub-county before selecting a ward.');
    } else if (process.env.NODE_ENV === 'production') throw fail('Choose a supported county.');
  } else if (subName || wardName) throw fail('Choose a county before selecting a sub-county or ward.');
  for (const key of ['latitude', 'longitude']) {
    if (body[key] !== undefined) result[key] = body[key] === null || body[key] === '' ? null : Number(body[key]);
  }
  const lat = result.latitude !== undefined ? result.latitude : existing?.latitude;
  const lng = result.longitude !== undefined ? result.longitude : existing?.longitude;
  if ((lat == null) !== (lng == null)) throw fail('Provide both latitude and longitude, or neither.');
  if (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) throw fail('GPS coordinates are invalid.');
  return result;
}

/** Remove private reporter information even when a repository includes a relation. */
export function sanitizeReport(report, user = null) {
  if (!report) return null;
  const result = { ...report };
  const privileged = canSeeReporterIdentity(user, report);
  if (!privileged) {
    if (result.reporterId !== null) delete result.reporterId;
    delete result.reporter;
    delete result.citizenFeedback;
    delete result.rejectionReason;
  } else if (result.reporter) {
    const { password, ...safe } = result.reporter;
    result.reporter = report.isAnonymous && user?.role === 'CITIZEN' ? { name: 'Anonymous Citizen' } : safe;
  }
  if (result.assignedOfficer) {
    const { password, ...safe } = result.assignedOfficer;
    result.assignedOfficer = safe;
  }
  return result;
}
