/**
 * ONE-COMMAND CLASSROOM DEMO LAUNCHER (development/demo only — NOT production).
 *
 * Runs the real Express API against the in-memory store (no PostgreSQL install,
 * no .env files needed) and seeds realistic Kisii County data: 7 departments,
 * 7 categories, 16 accounts (all 14 government roles + 2 citizens), 16 reports
 * across statuses, plus assignments, escalations and notifications.
 *
 * Start everything from the repository root with:  npm run demo
 * Or run just the API from backend/:              npm run demo
 *
 * Demo mode disables auth rate-limiting so repeated logins during a live
 * presentation never lock you out. Production code keeps all rate limits.
 * All demo accounts use the password:  TestPassword123!
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Work from the backend directory regardless of where the script is invoked.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(backendDir);

// Force demo configuration BEFORE importing any backend module. Empty-string
// DB vars are preserved by dotenv (it never overrides existing keys), so the
// backend stays in memory mode even if a backend/.env file exists.
process.env.NODE_ENV = 'test'; // demo mode: skips auth throttling, no auto-listen
process.env.PORT = process.env.PORT || '5000';
process.env.DATABASE_URL = '';
process.env.PGHOST = '';
process.env.PGUSER = '';
process.env.PGPASSWORD = '';
process.env.PGDATABASE = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'demo_access_secret_key_0123456789_abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'demo_refresh_secret_key_0123456789_abcdef';
process.env.JWT_EXPIRES_IN = '60m';
process.env.CLIENT_URL = [
  'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002',
  'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002',
  'http://localhost:5173',
].join(',');

const bcrypt = (await import('bcryptjs')).default;
const { default: db } = await import('../config/db.js');
const { memoryStore } = await import('../repositories/memoryStore.js');
const { default: locationRepository } = await import('../repositories/locationRepository.js');

const PASSWORD = 'TestPassword123!';
const hash = await bcrypt.hash(PASSWORD, 10);
const daysAgo = (d) => new Date(Date.now() - d * 86400000);

// ---- Departments ----
const DEPARTMENTS = [
  { code: 'INFRA', name: 'Infrastructure, Roads & Public Works' },
  { code: 'WATER', name: 'Water, Environment, Natural Resources, Energy & Climate Change' },
  { code: 'PUBLIC_SERVICE', name: 'Public Service, County Administration & Participatory Development' },
  { code: 'TRADE', name: 'Trade, Tourism, Industry & Marketing' },
  { code: 'YOUTH', name: 'Youth, Sports, Culture, Arts & Social Services' },
  { code: 'DISASTER', name: 'Disaster Management' },
  { code: 'ENFORCEMENT', name: 'Enforcement' },
];
const deptByCode = {};
for (const d of DEPARTMENTS) deptByCode[d.code] = await db.createDepartment(d);

// ---- Categories + subcategories ----
const CATEGORIES = [
  { code: 'ROADS', name: 'Roads, Traffic & Mobility', departmentCode: 'INFRA', subs: ['Pothole', 'Multiple potholes', 'Damaged road surface', 'Blocked road', 'Missing road sign', 'Dangerous junction'] },
  { code: 'WATER', name: 'Water & Sewerage', departmentCode: 'WATER', subs: ['No water / water outage', 'Burst water pipe', 'Leaking water pipe', 'Contaminated water', 'Blocked sewer', 'Open sewage'] },
  { code: 'DRAINAGE', name: 'Drainage & Flood Control', departmentCode: 'INFRA', subs: ['Blocked roadside drain', 'Active flooding', 'Flash flooding', 'Collapsed drain', 'Standing water'] },
  { code: 'WASTE', name: 'Solid Waste & Environment', departmentCode: 'WATER', subs: ['Uncollected garbage', 'Illegal dumping', 'Overflowing bins', 'Open burning of waste', 'River pollution'] },
  { code: 'LIGHTING', name: 'Street Lighting & Power', departmentCode: 'INFRA', subs: ['Street light not working', 'Flickering street light', 'Exposed wiring', 'Power outage'] },
  { code: 'FACILITIES', name: 'Public Facilities, Markets & Parks', departmentCode: null, subs: ['Damaged public facility', 'Market sanitation', 'Park maintenance', 'Broken public bench'] },
  { code: 'SAFETY', name: 'Public Safety & Hazards', departmentCode: 'DISASTER', subs: ['Fire outbreak', 'Building collapse risk', 'Fallen tree', 'Open manhole', 'Flooding emergency'] },
];
const catByCode = {};
for (const c of CATEGORIES) {
  const cat = await db.createCategory({ name: c.name, code: c.code, departmentId: c.departmentCode ? deptByCode[c.departmentCode].id : null });
  catByCode[c.code] = cat;
  for (const s of c.subs) await db.createSubcategory({ categoryId: cat.id, name: s });
}

// ---- Geography (auto-seeded in memory on import) ----
const kisii = await locationRepository.findCountyByName('Kisii');
const bobasi = await locationRepository.findSubCountyByName(kisii.id, 'Bobasi');
const nyaribari = await locationRepository.findSubCountyByName(kisii.id, 'Nyaribari Masaba');
const bassi = await locationRepository.findWardByName(bobasi.id, 'Bassi Central');
const kiamokama = await locationRepository.findWardByName(nyaribari.id, 'Kiamokama');

// ---- Accounts (all 14 government roles + 2 citizens) ----
const ACCOUNTS = [
  { name: 'Alice Wanjiku', email: 'citizen.alice@example.com', role: 'CITIZEN', sc: bobasi, w: bassi },
  { name: 'Bob Otieno', email: 'citizen.bob@example.com', role: 'CITIZEN', sc: nyaribari, w: kiamokama },
  { name: 'Platform Admin', email: 'admin.platform@example.com', role: 'SUPER_ADMIN' },
  { name: 'Governor Kisii County', email: 'governor.kisii@example.com', role: 'GOVERNOR' },
  { name: 'CECM Infrastructure', email: 'cecm.infrastructure@example.com', role: 'CECM', dept: 'INFRA' },
  { name: 'Chief Officer Infrastructure', email: 'chief.officer.infra@example.com', role: 'CHIEF_OFFICER', dept: 'INFRA' },
  { name: 'Technical Head Infrastructure', email: 'tech.head.infra@example.com', role: 'TECHNICAL_HEAD', dept: 'INFRA' },
  { name: 'Technical Supervisor Infrastructure', email: 'tech.supervisor.infra@example.com', role: 'TECHNICAL_SUPERVISOR', dept: 'INFRA', sc: bobasi, w: bassi },
  { name: 'Sub-County Admin Bobasi', email: 'subcounty.admin.bobasi@example.com', role: 'SUBCOUNTY_ADMIN', sc: bobasi },
  { name: 'Ward Admin Bassi Central', email: 'ward.admin.bassicentral@example.com', role: 'WARD_ADMIN', sc: bobasi, w: bassi },
  { name: 'Field Officer One', email: 'field.officer.1@example.com', role: 'FIELD_OFFICER', dept: 'INFRA', sc: bobasi, w: bassi },
  { name: 'Disaster Manager', email: 'disaster.manager@example.com', role: 'DISASTER_MANAGER', dept: 'DISASTER' },
  { name: 'Enforcement Officer', email: 'enforcement.officer@example.com', role: 'ENFORCEMENT_OFFICER', dept: 'ENFORCEMENT' },
  { name: 'General Officer', email: 'officer.general@example.com', role: 'OFFICER', dept: 'INFRA', sc: bobasi, w: bassi },
  { name: 'Departmental Admin Infrastructure', email: 'dept.admin.infra@example.com', role: 'DEPARTMENTAL_ADMIN', dept: 'INFRA' },
  { name: 'County Administrator', email: 'admin.county@example.com', role: 'ADMIN' },
];
const userByEmail = {};
for (const a of ACCOUNTS) {
  const u = await db.createUser({
    name: a.name, email: a.email, password: hash, role: a.role,
    isVerified: true, emailVerified: true, isActive: true,
    county: 'Kisii', countyId: kisii.id,
    subCounty: a.sc?.name || null, subCountyId: a.sc?.id || null,
    ward: a.w?.name || null, wardId: a.w?.id || null,
    departmentId: a.dept ? deptByCode[a.dept].id : null,
  });
  userByEmail[a.email] = u;
}
const alice = userByEmail['citizen.alice@example.com'];
const bob = userByEmail['citizen.bob@example.com'];
const fieldOfficer = userByEmail['field.officer.1@example.com'];
const techSup = userByEmail['tech.supervisor.infra@example.com'];
const wardAdmin = userByEmail['ward.admin.bassicentral@example.com'];

// ---- Reports across statuses/categories/wards ----
const REPORTS = [
  { title: 'Pothole on Bassi Central Road near Market', cat: 'ROADS', sub: 'Pothole', priority: 'HIGH', status: 'RESOLVED', reporter: alice, sc: bobasi, w: bassi, dept: 'INFRA', age: 12, resolvedAge: 2, lat: -0.6815, lng: 34.7723, desc: 'Large pothole on the main road through Bassi Central Ward near the market entrance. Vehicles are being damaged and pedestrians are at risk.' },
  { title: 'Burst water pipe along Bobasi–Bassi road', cat: 'WATER', sub: 'Burst water pipe', priority: 'CRITICAL', status: 'IN_PROGRESS', reporter: alice, sc: bobasi, w: bassi, dept: 'WATER', age: 5, lat: -0.6901, lng: 34.7810, desc: 'A burst main pipe is flooding the road reserve and cutting supply to several households.' },
  { title: 'Blocked drainage causing flooding at Bassi junction', cat: 'DRAINAGE', sub: 'Active flooding', priority: 'HIGH', status: 'ASSIGNED', reporter: alice, sc: bobasi, w: bassi, dept: 'INFRA', age: 3, lat: -0.6790, lng: 34.7699, desc: 'Stormwater drain is blocked by debris and the junction floods whenever it rains.' },
  { title: 'Uncollected garbage at Kiamokama shopping centre', cat: 'WASTE', sub: 'Uncollected garbage', priority: 'MEDIUM', status: 'SUBMITTED', reporter: bob, sc: nyaribari, w: kiamokama, dept: 'WATER', age: 1, lat: -0.7212, lng: 34.8021, desc: 'Garbage has not been collected for two weeks and is piling up next to the stalls.' },
  { title: 'Street lights out along Bassi Central stretch', cat: 'LIGHTING', sub: 'Street light not working', priority: 'MEDIUM', status: 'IN_PROGRESS', reporter: alice, sc: bobasi, w: bassi, dept: 'INFRA', age: 8, lat: -0.6834, lng: 34.7745, desc: 'Six consecutive street lights are not working, making the area unsafe at night.' },
  { title: 'Open manhole near Bassi primary school', cat: 'SAFETY', sub: 'Open manhole', priority: 'CRITICAL', status: 'ESCALATED', reporter: alice, sc: bobasi, w: bassi, dept: 'DISASTER', age: 6, lat: -0.6802, lng: 34.7712, desc: 'An uncovered manhole poses a serious danger to children walking to school.' },
  { title: 'Damaged public bench at Bassi park', cat: 'FACILITIES', sub: 'Broken public bench', priority: 'LOW', status: 'SUBMITTED', reporter: bob, sc: bobasi, w: bassi, dept: null, age: 2, lat: -0.6820, lng: 34.7730, desc: 'Several benches at the public park are broken and unusable.' },
  { title: 'Contaminated water reported in Kiamokama', cat: 'WATER', sub: 'Contaminated water', priority: 'HIGH', status: 'UNDER_REVIEW', reporter: bob, sc: nyaribari, w: kiamokama, dept: 'WATER', age: 4, lat: -0.7198, lng: 34.8005, desc: 'Residents report brown, bad-smelling water from the public tap.' },
  { title: 'Multiple potholes on Nyaribari Masaba access road', cat: 'ROADS', sub: 'Multiple potholes', priority: 'HIGH', status: 'IN_PROGRESS', reporter: bob, sc: nyaribari, w: kiamokama, dept: 'INFRA', age: 9, lat: -0.7250, lng: 34.8050, desc: 'The access road has degraded badly with multiple deep potholes.' },
  { title: 'Illegal dumping near Bassi riverbank', cat: 'WASTE', sub: 'Illegal dumping', priority: 'MEDIUM', status: 'RESOLVED', reporter: alice, sc: bobasi, w: bassi, dept: 'WATER', age: 15, resolvedAge: 5, lat: -0.6850, lng: 34.7760, desc: 'Construction waste is being dumped on the riverbank.' },
  { title: 'Flash flooding after heavy rains in Bassi', cat: 'DRAINAGE', sub: 'Flash flooding', priority: 'CRITICAL', status: 'ESCALATED', reporter: alice, sc: bobasi, w: bassi, dept: 'INFRA', age: 2, lat: -0.6788, lng: 34.7688, desc: 'Heavy rains caused flash flooding affecting homes and the road.' },
  { title: 'Missing road sign at dangerous Bassi junction', cat: 'ROADS', sub: 'Missing road sign', priority: 'MEDIUM', status: 'SUBMITTED', reporter: bob, sc: bobasi, w: bassi, dept: 'INFRA', age: 1, lat: -0.6795, lng: 34.7702, desc: 'The stop sign at the junction is missing, causing near-misses.' },
  { title: 'Sewer overflow behind Kiamokama market', cat: 'WATER', sub: 'Open sewage', priority: 'HIGH', status: 'ASSIGNED', reporter: bob, sc: nyaribari, w: kiamokama, dept: 'WATER', age: 7, lat: -0.7205, lng: 34.8012, desc: 'Raw sewage is overflowing behind the market stalls.' },
  { title: 'Fallen tree blocking footpath in Bassi', cat: 'SAFETY', sub: 'Fallen tree', priority: 'MEDIUM', status: 'RESOLVED', reporter: alice, sc: bobasi, w: bassi, dept: 'DISASTER', age: 20, resolvedAge: 12, lat: -0.6810, lng: 34.7720, desc: 'A fallen tree blocked the pedestrian footpath.' },
  { title: 'Flickering street light near Bassi stage', cat: 'LIGHTING', sub: 'Flickering street light', priority: 'LOW', status: 'SUBMITTED', reporter: alice, sc: bobasi, w: bassi, dept: 'INFRA', age: 0, lat: -0.6828, lng: 34.7738, desc: 'The street light near the bus stage flickers constantly.' },
  { title: 'Damaged road surface after flooding in Kiamokama', cat: 'ROADS', sub: 'Damaged road surface', priority: 'HIGH', status: 'UNDER_REVIEW', reporter: bob, sc: nyaribari, w: kiamokama, dept: 'INFRA', age: 11, lat: -0.7240, lng: 34.8040, desc: 'Recent flooding stripped the road surface leaving it dangerously rough.' },
];
const createdReports = [];
for (const r of REPORTS) {
  const cat = catByCode[r.cat];
  const report = await db.createReport({
    title: r.title, description: r.desc, category: cat.name, subCategory: r.sub,
    categoryId: cat.id, priority: r.priority, status: r.status,
    location: `${r.w.name}, ${r.sc.name}, Kisii`, county: 'Kisii', subCounty: r.sc.name, ward: r.w.name,
    countyId: kisii.id, subCountyId: r.sc.id, wardId: r.w.id,
    departmentId: r.dept ? deptByCode[r.dept].id : null,
    latitude: r.lat, longitude: r.lng, reporterId: r.reporter.id,
    assignedOfficerId: ['ASSIGNED', 'IN_PROGRESS', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED'].includes(r.status) ? fieldOfficer.id : null,
    mediaUrls: [],
  });
  const stored = memoryStore.reports.get(report.id);
  stored.createdAt = daysAgo(r.age);
  stored.updatedAt = daysAgo(Math.max(0, r.age - 1));
  if (r.status === 'RESOLVED') {
    stored.resolvedAt = daysAgo(r.resolvedAge ?? 1);
    stored.resolutionNotes = 'Issue addressed and verified on site by the assigned officer.';
    stored.resolutionStatus = 'ACCEPTED';
    stored.citizenFeedback = 'Thank you for the quick response.';
  }
  createdReports.push({ ...r, id: report.id, referenceCode: report.referenceCode });
}

// ---- Assignments + escalations ----
for (const r of createdReports) {
  if (['ASSIGNED', 'IN_PROGRESS', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED'].includes(r.status)) {
    await db.createAssignment({ reportId: r.id, officerId: fieldOfficer.id, assignedById: techSup.id, reason: 'Routine assignment' });
  }
  if (r.status === 'ESCALATED') {
    await db.createEscalation({ reportId: r.id, reason: 'SLA breached — requires urgent attention', priority: 'CRITICAL', escalatedById: wardAdmin.id, previousStatus: 'IN_PROGRESS' });
  }
}

// ---- Notifications ----
const notifTargets = [alice, userByEmail['governor.kisii@example.com'], fieldOfficer, wardAdmin, userByEmail['cecm.infrastructure@example.com']];
for (const u of notifTargets) {
  if (!u) continue;
  await db.createNotification({ userId: u.id, title: 'Report status updated', message: 'A report in your jurisdiction changed status.', type: 'INFO' });
  await db.createNotification({ userId: u.id, title: 'New report assigned', message: 'A new report has been routed to your department.', type: 'INFO' });
  await db.createNotification({ userId: u.id, title: 'Escalation alert', message: 'A critical report was escalated and needs attention.', type: 'WARNING' });
}

console.log('');
console.log('================ MTAA Fix demo data ready ================');
console.log(`  departments=${DEPARTMENTS.length}  categories=${CATEGORIES.length}  accounts=${ACCOUNTS.length}  reports=${createdReports.length}`);
console.log(`  Password for EVERY account: ${PASSWORD}`);
console.log('  Citizen app:      http://localhost:3000');
console.log('  Admin dashboard:  http://localhost:3001');
console.log('  Government:       http://localhost:3002');
console.log('==========================================================');
console.log('');

// In demo (test) mode index.js does not auto-listen; start it explicitly.
const { default: app } = await import('../index.js');
const port = Number(process.env.PORT || 5000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[demo] API listening on http://localhost:${port} (demo mode, rate limits skipped)`);
});
