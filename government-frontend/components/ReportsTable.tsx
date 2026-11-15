"use client";

import type { ReactNode } from "react";

/**
 * Shared, consistently-aligned report table used across every government
 * report-list page. Replaces the previous per-page inline tables that had
 * mismatched header/body columns and vertically-stacked action buttons.
 *
 * Columns: Reference · Title · Category · Location · Department · [extra] ·
 * Status · Actions. The optional `extraColumn` inserts a page-specific column
 * (e.g. Priority, Days Outstanding, Resolution Date) before Status.
 *
 * Long text cells clamp to two lines (full value available via title tooltip)
 * so a single verbose department or location no longer stretches a row, and the
 * row actions sit in a compact two-column grid rather than a tall stack.
 */

export type ReportRow = {
  id: string;
  referenceCode?: string | null;
  title: string;
  category: string;
  location: string;
  department: string;
  status: string;
  [key: string]: unknown;
};

type ActionHandlers = {
  onView: (report: ReportRow) => void;
  onUpload?: (report: ReportRow) => void;
  onEscalate?: (report: ReportRow) => void;
  onAssign?: (report: ReportRow) => void;
};

type ReportsTableProps = {
  reports: ReportRow[];
  statusStyles: Record<string, string>;
  actions: ActionHandlers;
  canManage?: boolean;
  extraColumn?: { header: string; render: (report: ReportRow) => ReactNode };
};

const actionBase =
  "rounded-lg border px-2 py-1.5 text-xs font-medium text-center leading-tight transition";

function ClampedCell({ value, className }: { value: string; className: string }) {
  return (
    <td className={`p-3 ${className}`}>
      <span className="line-clamp-2" title={value}>
        {value}
      </span>
    </td>
  );
}

export default function ReportsTable({
  reports,
  statusStyles,
  actions,
  canManage = true,
  extraColumn,
}: ReportsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[#dce2d8] bg-[#eff1e9] text-[#687468]">
            <th className="p-3 font-semibold">Reference</th>
            <th className="p-3 font-semibold">Title</th>
            <th className="p-3 font-semibold">Category</th>
            <th className="p-3 font-semibold">Location</th>
            <th className="p-3 font-semibold">Department</th>
            {extraColumn && <th className="p-3 font-semibold">{extraColumn.header}</th>}
            <th className="p-3 font-semibold">Status</th>
            <th className="p-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-b border-[#dce2d8] align-top hover:bg-[#f5f8f5]">
              <td className="whitespace-nowrap p-3 font-mono text-xs font-medium text-[#187a58]">
                {report.referenceCode || report.id}
              </td>
              <ClampedCell value={report.title} className="min-w-[140px] max-w-[200px] font-medium text-[#173c32]" />
              <ClampedCell value={report.category} className="min-w-[100px] max-w-[130px] text-[#687468]" />
              <ClampedCell value={report.location} className="min-w-[104px] max-w-[140px] text-[#687468]" />
              <ClampedCell value={report.department} className="min-w-[104px] max-w-[140px] text-[#687468]" />
              {extraColumn && (
                <td className="whitespace-nowrap p-3 text-[#687468]">{extraColumn.render(report)}</td>
              )}
              <td className="p-3">
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[report.status] || "bg-[#e6ece3] text-[#31543a]"}`}
                >
                  {report.status}
                </span>
              </td>
              <td className="px-2 py-3">
                <div className="grid w-[168px] grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => actions.onView(report)}
                    className={`${actionBase} border-[#187a58] text-[#187a58] hover:bg-[#e6f3eb]`}
                  >
                    View Details
                  </button>
                  {canManage && actions.onUpload && (
                    <button
                      type="button"
                      onClick={() => actions.onUpload!(report)}
                      className={`${actionBase} border-[#187a58] text-[#187a58] hover:bg-[#e6f3eb]`}
                    >
                      Upload Evidence
                    </button>
                  )}
                  {canManage && actions.onEscalate && (
                    <button
                      type="button"
                      onClick={() => actions.onEscalate!(report)}
                      className={`${actionBase} border-[#8b392f] text-[#8b392f] hover:bg-[#fff3f0]`}
                    >
                      Escalate
                    </button>
                  )}
                  {canManage && actions.onAssign && (
                    <button
                      type="button"
                      onClick={() => actions.onAssign!(report)}
                      className={`${actionBase} border-[#187a58] text-[#187a58] hover:bg-[#e6f3eb]`}
                    >
                      Assign
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
