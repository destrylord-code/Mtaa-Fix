"use client";

import { useMemo } from "react";
import { EmptyState, LoadingState } from "./index";

/**
 * Generic workspace views for sidebar destinations that previously had no
 * dedicated section. Every view is driven by real, already-scoped data passed
 * from the dashboard (reports, personnel, assignments, structure, audit) — no
 * mock or hardcoded records. Styling mirrors the existing dashboard tables.
 */

export const WORKSPACE_TABS = new Set<string>([
  // Personnel directories
  "chief officers", "field officers", "technical supervisors", "technical officers",
  "departmental teams", "field team", "personnel directory", "authorized user management",
  // Performance & statistics
  "workload distribution", "department performance", "officer performance", "team workload",
  "team performance", "assessment statistics", "ward performance", "sub-county performance",
  "category statistics", "performance summary", "workload monitoring", "operational status",
  // Assignments
  "assignment history", "all assignments", "team assignments", "new assignments", "assignment monitoring",
  // Work & assessment filters
  "awaiting review", "approved assessments", "rejected assessments", "active projects",
  "delayed projects", "technical resolution reports", "verified work", "rejected work",
  // Structure directories
  "ward directory", "ward issues", "departments", "sub-counties", "wards",
  // Role assignments
  "role assignments", "administrative assignments",
  // Audit & configuration
  "decisions history", "status configuration", "authentication activity",
  "administrative actions", "application settings", "notifications configuration", "monthly reports",
]);

type Row = Record<string, any>;

type Props = {
  tab: string;
  title: string;
  role: string;
  reports: Row[];
  departments: Row[];
  officers: Row[];
  users: Row[];
  assignments: Row[];
  subCounties: Row[];
  wards: Row[];
  auditLogs: Row[];
  escalations: Row[];
  resolutions: Row[];
  deptNameById: Record<string, string>;
  loading: boolean;
  now: number;
};

const fmtDate = (value: unknown): string => {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const roleLabel = (role: unknown): string => String(role || "").replace(/_/g, " ");

const isResolved = (r: Row) => ["Resolved", "Closed"].includes(r.status);
const isOverdue = (r: Row, now: number) =>
  !["Resolved", "Rejected", "Closed", "Cancelled"].includes(r.status) &&
  r.createdAt && (now - new Date(r.createdAt).getTime()) / 86400000 > 7;

function Section({ title, description, children, badge }: { title: string; description: string; children: React.ReactNode; badge?: { label: string; value: number | string } }) {
  return (
    <section className="rounded-xl border border-[#dce2d8] bg-[#fdfdf9] p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-[#173c32]">{title}</h3>
          <p className="mt-1 text-sm text-[#687468]">{description}</p>
        </div>
        {badge && (
          <div className="rounded-lg border border-[#dce2d8] p-4">
            <p className="text-sm text-[#687468]">{badge.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#173c32]">{badge.value}</p>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function Table({ headers, children, minWidth = 900 }: { headers: string[]; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-sm`} style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#dce2d8] bg-[#eff1e9] text-[#687468]">
            {headers.map((h) => (
              <th key={h} className="p-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const rateBadge = (rate: number) => (
  <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${rate >= 70 ? "text-[#187a58] bg-[#e6f3eb]" : rate >= 40 ? "text-[#66572f] bg-[#f0ebd9]" : "text-[#8b392f] bg-[#fff3f0]"}`}>
    {rate}%
  </span>
);

function PerformanceTable({ grouped, dimension }: { grouped: Record<string, Row[]>; dimension: string }) {
  const entries = Object.entries(grouped);
  if (entries.length === 0) {
    return <EmptyState type="general" title="No data" description={`There are no reports to compute ${dimension.toLowerCase()} performance yet.`} />;
  }
  return (
    <Table headers={[dimension, "Reports Received", "Resolved", "Outstanding", "Resolution Rate"]}>
      {entries.map(([name, rows]) => {
        const resolved = rows.filter(isResolved).length;
        const rate = rows.length > 0 ? Math.round((resolved / rows.length) * 100) : 0;
        return (
          <tr key={name} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
            <td className="p-3 font-medium text-[#173c32]">{name}</td>
            <td className="p-3 text-[#687468]">{rows.length}</td>
            <td className="p-3 text-[#687468]">{resolved}</td>
            <td className="p-3 text-[#687468]">{rows.length - resolved}</td>
            <td className="p-3">{rateBadge(rate)}</td>
          </tr>
        );
      })}
    </Table>
  );
}

export function WorkspaceSection(props: Props) {
  const { tab, title, role, reports, departments, officers, users, assignments, subCounties, wards, auditLogs, escalations, resolutions, deptNameById, loading, now } = props;

  const groupBy = (key: (r: Row) => string) => {
    const grouped: Record<string, Row[]> = {};
    reports.forEach((r) => {
      const k = key(r) || "Unassigned";
      (grouped[k] ||= []).push(r);
    });
    return grouped;
  };

  const officerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    [...officers, ...users].forEach((u) => { if (u?.id) map[String(u.id)] = u.name || u.email || String(u.id); });
    return map;
  }, [officers, users]);

  const personnel = users.length > 0 && (role === "ADMIN" || role === "SUPER_ADMIN") ? users : officers;

  // ---- Personnel directories ----
  const personnelRoleFilter: Record<string, string[]> = {
    "chief officers": ["CHIEF_OFFICER"],
    "field officers": ["FIELD_OFFICER"],
    "technical supervisors": ["TECHNICAL_SUPERVISOR"],
    "technical officers": ["TECHNICAL_HEAD", "OFFICER"],
    "field team": ["FIELD_OFFICER", "OFFICER"],
  };
  if (["chief officers", "field officers", "technical supervisors", "technical officers", "departmental teams", "field team", "personnel directory", "authorized user management"].includes(tab)) {
    const roles = personnelRoleFilter[tab];
    const list = roles ? personnel.filter((u) => roles.includes(String(u.role))) : personnel.filter((u) => String(u.role) !== "CITIZEN");
    return (
      <Section title={title} description="Officers and personnel within your jurisdiction, from the live user directory." badge={{ label: "Personnel", value: list.length }}>
        {loading ? <LoadingState message="Loading personnel…" /> : list.length === 0 ? (
          <EmptyState type="general" title="No personnel" description="No matching officers were found for your jurisdiction." />
        ) : (
          <Table headers={["Name", "Email", "Role", "Department", "Ward", "Status"]}>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{u.name}</td>
                <td className="p-3 text-[#687468]">{u.email}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{roleLabel(u.role)}</td>
                <td className="p-3 text-[#687468]">{(u.departmentId && deptNameById[String(u.departmentId)]) || u.department || "—"}</td>
                <td className="p-3 text-[#687468]">{u.ward || "—"}</td>
                <td className="p-3">
                  <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${u.isActive === false ? "bg-[#fff3f0] text-[#8b392f]" : "bg-[#e6f3eb] text-[#187a58]"}`}>
                    {u.isActive === false ? "Inactive" : "Active"}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }

  // ---- Performance & statistics ----
  if (["department performance", "operational status"].includes(tab)) {
    return <Section title={title} description="Service delivery performance by department, computed from scoped reports." badge={{ label: "Departments", value: Object.keys(groupBy((r) => r.department)).length }}><PerformanceTable grouped={groupBy((r) => r.department)} dimension="Department" /></Section>;
  }
  if (tab === "ward performance") {
    return <Section title={title} description="Service delivery performance across wards, computed from scoped reports."><PerformanceTable grouped={groupBy((r) => r.ward)} dimension="Ward" /></Section>;
  }
  if (tab === "sub-county performance") {
    return <Section title={title} description="Service delivery performance across sub-counties, computed from scoped reports."><PerformanceTable grouped={groupBy((r) => r.subCounty)} dimension="Sub-County" /></Section>;
  }
  if (["category statistics", "assessment statistics"].includes(tab)) {
    return <Section title={title} description="Report volume and resolution by category, computed from scoped reports."><PerformanceTable grouped={groupBy((r) => r.category)} dimension="Category" /></Section>;
  }
  if (["officer performance", "workload distribution", "team workload", "workload monitoring", "team performance", "performance summary"].includes(tab)) {
    const grouped = groupBy((r) => (r.assignedOfficerId ? officerNameById[String(r.assignedOfficerId)] || "Assigned officer" : "Unassigned"));
    return <Section title={title} description="Report workload and resolution per assigned officer, computed from scoped reports."><PerformanceTable grouped={grouped} dimension="Officer" /></Section>;
  }

  // ---- Assignments ----
  if (["all assignments", "new assignments", "team assignments", "assignment history", "assignment monitoring"].includes(tab)) {
    let list = assignments;
    if (tab === "new assignments") {
      list = assignments.filter((a) => !a.status || ["PENDING", "ACTIVE", "ASSIGNED"].includes(String(a.status).toUpperCase()));
    }
    return (
      <Section title={title} description="Report assignments within your jurisdiction, from the live assignment register." badge={{ label: "Assignments", value: list.length }}>
        {loading ? <LoadingState message="Loading assignments…" /> : list.length === 0 ? (
          <EmptyState type="general" title="No assignments" description="There are no assignments recorded for your jurisdiction yet." />
        ) : (
          <Table headers={["Report", "Officer", "Assigned By", "Reason", "Date"]}>
            {list.map((a, i) => (
              <tr key={a.id || `assignment-${i}`} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{a.reportReference || a.reportTitle || a.reportId || "—"}</td>
                <td className="p-3 text-[#687468]">{a.officerName || officerNameById[String(a.officerId)] || a.officerId || "—"}</td>
                <td className="p-3 text-[#687468]">{a.assignedByName || a.assignedById || "—"}</td>
                <td className="p-3 text-[#687468] max-w-[220px] truncate">{a.reason || "—"}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{fmtDate(a.createdAt || a.assignedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }

  // ---- Work & assessment filters ----
  if (["awaiting review", "active projects", "delayed projects"].includes(tab)) {
    const list = reports.filter((r) => {
      if (tab === "awaiting review") return r.status === "Under Review" || r.status === "Pending";
      if (tab === "active projects") return ["In Progress", "Assigned", "Inspection In Progress"].includes(r.status);
      return isOverdue(r, now);
    });
    const desc = tab === "delayed projects" ? "Reports that have exceeded the 7-day service window." : tab === "active projects" ? "Reports currently assigned or in progress." : "Reports awaiting review or submission.";
    return (
      <Section title={title} description={desc} badge={{ label: "Reports", value: list.length }}>
        {list.length === 0 ? <EmptyState type="reports" /> : (
          <Table headers={["Reference", "Title", "Location", "Status", "Priority", "Date"]}>
            {list.map((r) => (
              <tr key={r.id} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#187a58]">{r.referenceCode || r.id}</td>
                <td className="p-3 text-[#173c32] max-w-[240px] truncate">{r.title}</td>
                <td className="p-3 text-[#687468]">{r.location}</td>
                <td className="p-3 text-[#687468]">{r.status}</td>
                <td className="p-3 text-[#687468]">{r.priority || "—"}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{fmtDate(r.createdAt || r.date)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (["approved assessments", "rejected assessments", "verified work", "rejected work", "technical resolution reports"].includes(tab)) {
    const want = tab === "approved assessments" || tab === "verified work" ? "ACCEPTED" : tab === "rejected assessments" || tab === "rejected work" ? "REJECTED" : null;
    const list = want ? resolutions.filter((res) => String(res.status || res.resolutionStatus || "").toUpperCase().includes(want)) : resolutions;
    return (
      <Section title={title} description="Resolution outcomes within your jurisdiction, from the live resolution register." badge={{ label: "Resolutions", value: list.length }}>
        {loading ? <LoadingState message="Loading resolutions…" /> : list.length === 0 ? (
          <EmptyState type="general" title="No resolutions" description="There are no matching resolution records for your jurisdiction yet." />
        ) : (
          <Table headers={["Report", "Submitted By", "Status", "Notes", "Resolved At"]}>
            {list.map((res, i) => (
              <tr key={res.id || `resolution-${i}`} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{res.reportTitle || res.reportId || "—"}</td>
                <td className="p-3 text-[#687468]">{res.submittedByName || res.submittedById || "—"}</td>
                <td className="p-3 text-[#687468]">{res.status || res.resolutionStatus || "—"}</td>
                <td className="p-3 text-[#687468] max-w-[220px] truncate">{res.notes || "No notes recorded"}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{fmtDate(res.resolvedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }

  // ---- Structure directories ----
  if (tab === "departments") {
    return (
      <Section title={title} description="County departments and their report workload." badge={{ label: "Departments", value: departments.length }}>
        {loading ? <LoadingState message="Loading departments…" /> : departments.length === 0 ? <EmptyState type="general" title="No departments" description="No departments are configured." /> : (
          <Table headers={["Department", "Code", "Reports"]}>
            {departments.map((d) => (
              <tr key={d.id} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{d.name}</td>
                <td className="p-3 text-[#687468]">{d.code || "—"}</td>
                <td className="p-3 text-[#687468]">{reports.filter((r) => r.departmentId === d.id || r.department === d.name).length}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "sub-counties") {
    return (
      <Section title={title} description="Sub-counties in Kisii County, from the live geography register." badge={{ label: "Sub-Counties", value: subCounties.length }}>
        {loading ? <LoadingState message="Loading sub-counties…" /> : subCounties.length === 0 ? <EmptyState type="general" title="No sub-counties" description="No sub-counties were found." /> : (
          <Table headers={["Sub-County", "Reports"]}>
            {subCounties.map((sc) => (
              <tr key={sc.id} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{sc.name}</td>
                <td className="p-3 text-[#687468]">{reports.filter((r) => r.subCounty === sc.name).length}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "wards" || tab === "ward directory") {
    return (
      <Section title={title} description="Wards in Kisii County, from the live geography register." badge={{ label: "Wards", value: wards.length }}>
        {loading ? <LoadingState message="Loading wards…" /> : wards.length === 0 ? <EmptyState type="general" title="No wards" description="No wards were found." /> : (
          <Table headers={["Ward", "Sub-County", "Reports"]}>
            {wards.map((w) => (
              <tr key={w.id} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{w.name}</td>
                <td className="p-3 text-[#687468]">{w.subCountyName || "—"}</td>
                <td className="p-3 text-[#687468]">{reports.filter((r) => r.ward === w.name).length}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "ward issues") {
    return <Section title={title} description="Report volume and resolution by ward within your jurisdiction."><PerformanceTable grouped={groupBy((r) => r.ward)} dimension="Ward" /></Section>;
  }

  // ---- Role assignments ----
  if (tab === "role assignments" || tab === "administrative assignments") {
    const source = users.length > 0 ? users : officers;
    const byRole: Record<string, Row[]> = {};
    source.filter((u) => String(u.role) !== "CITIZEN").forEach((u) => { (byRole[String(u.role)] ||= []).push(u); });
    const roles = Object.keys(byRole).sort();
    return (
      <Section title={title} description="Government personnel grouped by their assigned role." badge={{ label: "Roles", value: roles.length }}>
        {loading ? <LoadingState message="Loading roles…" /> : roles.length === 0 ? <EmptyState type="general" title="No role assignments" description="No government personnel were found." /> : (
          <Table headers={["Role", "Personnel", "Members"]}>
            {roles.map((r) => (
              <tr key={r} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{roleLabel(r)}</td>
                <td className="p-3 text-[#687468]">{byRole[r].map((u) => u.name).join(", ")}</td>
                <td className="p-3 text-[#687468]">{byRole[r].length}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }

  // ---- Audit & configuration ----
  if (tab === "authentication activity" || tab === "administrative actions") {
    const list = auditLogs.filter((l) => {
      const action = String(l.action || l.type || "").toUpperCase();
      return tab === "authentication activity" ? /LOGIN|LOGOUT|AUTH|TOKEN|PASSWORD|VERIFY/.test(action) : !/LOGIN|LOGOUT|AUTH|TOKEN|PASSWORD|VERIFY/.test(action);
    });
    return (
      <Section title={title} description="Audit trail entries from the live audit log." badge={{ label: "Entries", value: list.length }}>
        {loading ? <LoadingState message="Loading audit logs…" /> : list.length === 0 ? <EmptyState type="general" title="No audit entries" description="There are no matching audit entries yet." /> : (
          <Table headers={["Action", "User", "Details", "Date"]}>
            {list.map((l, i) => (
              <tr key={l.id || `audit-${i}`} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{l.action || l.type || "—"}</td>
                <td className="p-3 text-[#687468]">{l.userName || l.userEmail || l.userId || "—"}</td>
                <td className="p-3 text-[#687468] max-w-[260px] truncate">{l.description || l.details || l.entity || "—"}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{fmtDate(l.createdAt || l.timestamp)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "decisions history") {
    const list = [...escalations, ...resolutions];
    return (
      <Section title={title} description="Escalation and resolution decisions within your jurisdiction." badge={{ label: "Decisions", value: list.length }}>
        {loading ? <LoadingState message="Loading decisions…" /> : list.length === 0 ? <EmptyState type="general" title="No decisions" description="There are no escalation or resolution decisions yet." /> : (
          <Table headers={["Type", "Report", "Status", "Reason / Notes", "Date"]}>
            {list.map((d, i) => (
              <tr key={d.id || `decision-${i}`} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{d.reason && !d.notes ? "Escalation" : "Resolution"}</td>
                <td className="p-3 text-[#687468]">{d.reportTitle || d.reportId || "—"}</td>
                <td className="p-3 text-[#687468]">{d.status || d.resolutionStatus || "—"}</td>
                <td className="p-3 text-[#687468] max-w-[240px] truncate">{d.reason || d.notes || "—"}</td>
                <td className="whitespace-nowrap p-3 text-[#687468]">{fmtDate(d.createdAt || d.resolvedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "monthly reports") {
    const grouped: Record<string, { total: number; resolved: number }> = {};
    reports.forEach((r) => {
      const month = r.date ? String(r.date).slice(0, 7) : "unknown";
      (grouped[month] ||= { total: 0, resolved: 0 }).total += 1;
      if (isResolved(r)) grouped[month].resolved += 1;
    });
    const entries = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
    return (
      <Section title={title} description="Monthly report volume and resolution, computed from scoped reports.">
        {entries.length === 0 ? <EmptyState type="general" title="No data" description="There are no reports to summarise yet." /> : (
          <Table headers={["Month", "Reports", "Resolved", "Resolution Rate"]} minWidth={600}>
            {entries.map(([month, s]) => (
              <tr key={month} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
                <td className="p-3 font-medium text-[#173c32]">{month}</td>
                <td className="p-3 text-[#687468]">{s.total}</td>
                <td className="p-3 text-[#687468]">{s.resolved}</td>
                <td className="p-3">{rateBadge(s.total > 0 ? Math.round((s.resolved / s.total) * 100) : 0)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    );
  }
  if (tab === "status configuration") {
    const statuses = ["Pending", "Under Review", "Verified", "Assigned", "In Progress", "Resolution Submitted", "Awaiting Verification", "Resolved", "Closed", "Reopened", "Rejected", "Escalated"];
    return (
      <Section title={title} description="The report status workflow used across the platform (read-only).">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <span key={s} className="inline-block rounded-full border border-[#dce2d8] bg-[#eff1e9] px-3 py-1 text-sm font-medium text-[#173c32]">{s}</span>
          ))}
        </div>
      </Section>
    );
  }
  if (tab === "notifications configuration") {
    const types = [
      { type: "INFO", desc: "Routine status updates and assignments." },
      { type: "WARNING", desc: "Escalations and SLA breaches requiring attention." },
      { type: "SUCCESS", desc: "Resolved and accepted reports." },
    ];
    return (
      <Section title={title} description="Notification categories delivered to users (read-only).">
        <Table headers={["Type", "Purpose"]} minWidth={500}>
          {types.map((t) => (
            <tr key={t.type} className="border-b border-[#dce2d8] hover:bg-[#f5f8f5]">
              <td className="p-3 font-medium text-[#173c32]">{t.type}</td>
              <td className="p-3 text-[#687468]">{t.desc}</td>
            </tr>
          ))}
        </Table>
      </Section>
    );
  }
  if (tab === "application settings") {
    return (
      <Section title={title} description="Platform configuration overview (read-only). Environment-specific values are managed via server environment variables.">
        <Table headers={["Setting", "Value"]} minWidth={500}>
          <tr className="border-b border-[#dce2d8]"><td className="p-3 font-medium text-[#173c32]">County</td><td className="p-3 text-[#687468]">Kisii</td></tr>
          <tr className="border-b border-[#dce2d8]"><td className="p-3 font-medium text-[#173c32]">Departments</td><td className="p-3 text-[#687468]">{departments.length}</td></tr>
          <tr className="border-b border-[#dce2d8]"><td className="p-3 font-medium text-[#173c32]">Password minimum</td><td className="p-3 text-[#687468]">10 characters</td></tr>
          <tr className="border-b border-[#dce2d8]"><td className="p-3 font-medium text-[#173c32]">Evidence storage</td><td className="p-3 text-[#687468]">Private authenticated uploads</td></tr>
        </Table>
      </Section>
    );
  }

  return null;
}

export default WorkspaceSection;
