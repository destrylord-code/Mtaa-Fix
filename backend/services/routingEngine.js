import db from '../config/db.js';

const specificity = (rule) => [rule.category, rule.subCategory, rule.county, rule.priority]
  .filter(Boolean).length;
const normalize = (value) => String(value || '').trim().toLowerCase();
const matches = (rule, report, categoryNames) => ['category', 'subCategory', 'county', 'priority']
  .every((key) => {
    if (!rule[key]) return true;
    if (key === 'category') {
      const a = categoryNames.get(normalize(rule[key])) ?? normalize(rule[key]);
      const b = categoryNames.get(normalize(report[key])) ?? normalize(report[key]);
      return a === b;
    }
    return normalize(rule[key]) === normalize(report[key]);
  });

/** Route both storage implementations identically; leave ambiguous cases for review. */
export async function applyRoutingRules(report) {
  const rules = await db.findRoutingRules({ isActive: true });
  const categories = await db.findCategories({ includeSubcategories: false });
  const categoryNames = new Map();
  for (const category of categories) { categoryNames.set(normalize(category.name), normalize(category.name)); categoryNames.set(normalize(category.code), normalize(category.name)); }
  const candidates = rules.filter((rule) => matches(rule, report, categoryNames) && (rule.departmentId || rule.officerId));
  candidates.sort((a, b) => specificity(b) - specificity(a) || String(a.id).localeCompare(String(b.id)));
  const rule = candidates[0];
  if (!rule) return report;
  const officer = rule.officerId ? await db.findUserById(rule.officerId) : null;
  const updates = { departmentId: rule.departmentId || officer?.departmentId || report.departmentId || null };
  if (officer?.isActive && officer.role !== 'CITIZEN') {
    updates.assignedOfficerId = officer.id;
    updates.status = 'ASSIGNED';
  }
  const updated = await db.updateReport(report.id, updates);
  if (updates.status === 'ASSIGNED') {
    await db.createAssignment({ reportId: report.id, officerId: officer.id, reason: `Auto-routed by rule "${rule.name}"` });
  }
  await db.createAuditLog({ action: 'REPORT_ROUTED', entityType: 'REPORT', entityId: report.id,
    previousValue: { departmentId: report.departmentId, status: report.status },
    newValue: { ...updates, routingRuleId: rule.id } });
  return updated;
}
