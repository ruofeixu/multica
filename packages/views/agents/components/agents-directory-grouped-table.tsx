"use client";

import { memo, useMemo } from "react";
import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import type {
  AgentsDirectoryRow,
  AgentsDirectoryWorkspaceGroup,
} from "@multica/core/agents";
import { useAgentsDirectorySelectionStore } from "@multica/core/agents";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { getCellStyle } from "@multica/ui/lib/data-table";
import { cn } from "@multica/ui/lib/utils";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@multica/ui/components/ui/table";
import { useT } from "../../i18n";
import { DirectoryRowCheckbox } from "./agents-directory-columns";

export const AgentsDirectoryGroupedTable = memo(function AgentsDirectoryGroupedTable({
  table,
  groups,
  onToggleGroup,
  onRowClick,
}: {
  table: TanstackTable<AgentsDirectoryRow>;
  groups: AgentsDirectoryWorkspaceGroup[];
  onToggleGroup: (ids: string[]) => void;
  onRowClick?: (row: AgentsDirectoryRow) => void;
}) {
  const { t } = useT("agents");
  const headerGroup = table.getHeaderGroups()[0];
  if (!headerGroup) return null;
  const colCount = headerGroup.headers.length;
  const columnSizing = table.getState().columnSizing;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <table
        className="w-full caption-bottom text-sm table-fixed"
        style={{ minWidth: table.getTotalSize() }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          {headerGroup.headers.map((header) => {
            const columnHasExplicitSize = Object.prototype.hasOwnProperty.call(
              columnSizing,
              header.column.id,
            );
            return (
              <TableHead
                key={header.id}
                className="h-10 bg-background"
                style={getCellStyle(header.column, {
                  hasExplicitSize: columnHasExplicitSize,
                })}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            );
          })}
        </TableHeader>

        {groups.map((group) => (
          <DirectoryGroupSection
            key={group.workspace.id}
            group={group}
            colCount={colCount}
            table={table}
            columnSizing={columnSizing}
            onToggleGroup={onToggleGroup}
            onRowClick={onRowClick}
            t={t}
          />
        ))}
      </table>
    </div>
  );
});

function DirectoryGroupSection({
  group,
  colCount,
  table,
  columnSizing,
  onToggleGroup,
  onRowClick,
  t,
}: {
  group: AgentsDirectoryWorkspaceGroup;
  colCount: number;
  table: TanstackTable<AgentsDirectoryRow>;
  columnSizing: Record<string, number>;
  onToggleGroup: (ids: string[]) => void;
  onRowClick?: (row: AgentsDirectoryRow) => void;
  t: ReturnType<typeof useT<"agents">>["t"];
}) {
  const groupIds = useMemo(
    () => group.rows.map((r) => r.agent.id),
    [group.rows],
  );
  const allGroupSelected = useAgentsDirectorySelectionStore((s) =>
    groupIds.length > 0 ? groupIds.every((id) => s.selectedIds.has(id)) : false,
  );

  return (
    <TableBody>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={colCount} className="py-2">
          <div className="flex items-center gap-3 px-1">
            <Checkbox
              checked={allGroupSelected}
              onCheckedChange={() => onToggleGroup(groupIds)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t(($) => $.directory.select_group, {
                name: group.workspace.name,
              })}
            />
            <span className="text-xs font-medium">{group.workspace.name}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
              {t(($) => $.directory.group_agent_count, {
                count: group.rows.length,
              })}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {group.rows.map((rowData) => {
        const row = table.getRow(rowData.agent.id);
        if (!row) return null;
        return (
          <DirectoryDataRow
            key={row.id}
            row={row}
            rowData={rowData}
            columnSizing={columnSizing}
            onRowClick={onRowClick}
          />
        );
      })}
    </TableBody>
  );
}

const DirectoryDataRow = memo(function DirectoryDataRow({
  row,
  rowData,
  columnSizing,
  onRowClick,
}: {
  row: ReturnType<TanstackTable<AgentsDirectoryRow>["getRow"]>;
  rowData: AgentsDirectoryRow;
  columnSizing: Record<string, number>;
  onRowClick?: (row: AgentsDirectoryRow) => void;
}) {
  const selected = useAgentsDirectorySelectionStore((s) =>
    s.selectedIds.has(rowData.agent.id),
  );

  return (
    <TableRow
      className={cn(onRowClick && "cursor-pointer", selected && "bg-accent/20")}
      onClick={() => onRowClick?.(rowData)}
    >
      {row.getVisibleCells().map((cell) => {
        if (cell.column.id === "select") {
          return (
            <TableCell key={cell.id}>
              <DirectoryRowCheckbox
                agentId={rowData.agent.id}
                agentName={rowData.agent.name}
              />
            </TableCell>
          );
        }
        const columnHasExplicitSize = Object.prototype.hasOwnProperty.call(
          columnSizing,
          cell.column.id,
        );
        return (
          <TableCell
            key={cell.id}
            style={getCellStyle(cell.column, {
              hasExplicitSize: columnHasExplicitSize,
            })}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
});
