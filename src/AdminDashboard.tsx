import React, { useMemo, useState } from "react";
import { CalendarX, Database, Download, ExternalLink, FileJson, RefreshCw, Trash2 } from "lucide-react";

const LOCAL_LINE_STATE_PREFIX = "foil_app_line_state";
const DAILY_RECORD_PREFIX = "daily_records_data";
const FULL_SNAPSHOT_PREFIX = "foil_app_full_snapshot";
const ACCOUNT_STORAGE_KEY = "foil_app_accounts";
const SESSION_STORAGE_KEY = "foil_app_session_user";
const LOCAL_BACKUP_SUFFIX = "__backup";

function isAppLocalDataKey(key: string) {
  return (
    key === ACCOUNT_STORAGE_KEY ||
    key === SESSION_STORAGE_KEY ||
    key === "adminAuth" ||
    key.startsWith(`${LOCAL_LINE_STATE_PREFIX}:`) ||
    key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`) ||
    key.startsWith(`${DAILY_RECORD_PREFIX}_`) ||
    key.endsWith(LOCAL_BACKUP_SUFFIX)
  );
}

function getDataLabel(key: string) {
  if (key.endsWith(LOCAL_BACKUP_SUFFIX)) return "本地镜像备份";
  if (key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`)) return "完整备份版本";
  if (key === ACCOUNT_STORAGE_KEY) return "账号配置";
  if (key === SESSION_STORAGE_KEY) return "当前登录用户";
  if (key === "adminAuth") return "后台登录状态";
  if (key.startsWith(`${LOCAL_LINE_STATE_PREFIX}:`)) return "生产线规划数据";
  if (key.startsWith(`${DAILY_RECORD_PREFIX}_`)) return "每日记录数据";
  return "本地数据";
}

function getBaseKey(key: string) {
  return key.endsWith(LOCAL_BACKUP_SUFFIX)
    ? key.slice(0, -LOCAL_BACKUP_SUFFIX.length)
    : key;
}

function extractDateFromKey(key: string) {
  const match = getBaseKey(key).match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getVersionCode(key: string, value: string) {
  const date = extractDateFromKey(key);
  const suffix = key.endsWith(LOCAL_BACKUP_SUFFIX) ? " 备份" : "";
  let timeLabel = "";
  const keyTimeMatch = getBaseKey(key).match(/\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})(?:\d{2})?/);
  if (keyTimeMatch) {
    timeLabel = ` ${keyTimeMatch[1]}:${keyTimeMatch[2]}`;
  }

  try {
    const parsed = JSON.parse(value);
    const candidates = [
      parsed?.savedAt,
      parsed?.updatedAt,
      parsed?.exportedAt,
      parsed?.timestamp,
      parsed?.createdAt,
      parsed?.snapshot?.savedAt,
      parsed?.snapshot?.currentTime,
    ];
    const dateCandidate = candidates.find((item) => typeof item === "string");
    if (dateCandidate) {
      const parsedDate = new Date(dateCandidate);
      if (Number.isFinite(parsedDate.getTime())) {
        timeLabel = ` ${parsedDate.getHours().toString().padStart(2, "0")}:${parsedDate.getMinutes().toString().padStart(2, "0")}`;
      }
    }
  } catch {
    // Non-JSON values still get a readable localStorage-based label.
  }

  if (date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}${timeLabel}${suffix}`;
  }

  if (key === ACCOUNT_STORAGE_KEY) return "账号配置";
  if (key === SESSION_STORAGE_KEY) return "当前用户";
  if (key === "adminAuth") return "后台状态";
  return getBaseKey(key).replace(/_/g, "-").slice(0, 24) + suffix;
}

function getVersionParts(key: string, value: string) {
  const versionCode = getVersionCode(key, value);
  const match = versionCode.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?(.*)$/);
  if (!match) {
    return {
      dateText: versionCode,
      timeText: "",
    };
  }
  return {
    dateText: `${match[1]}${match[3] || ""}`,
    timeText: match[2] || "未记录具体时间",
  };
}

function isDeletableKey(key: string) {
  return (
    key.startsWith(`${LOCAL_LINE_STATE_PREFIX}:`) ||
    key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`) ||
    key.startsWith(`${DAILY_RECORD_PREFIX}_`) ||
    key.endsWith(LOCAL_BACKUP_SUFFIX)
  );
}

function isLoadablePlanKey(key: string) {
  const baseKey = getBaseKey(key);
  return baseKey.startsWith(`${LOCAL_LINE_STATE_PREFIX}:`) || baseKey.startsWith(`${FULL_SNAPSHOT_PREFIX}:`);
}

function safeFormatJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function readLocalRows() {
  const rows: Array<{
    key: string;
    label: string;
    size: number;
    dateText: string;
    timeText: string;
    value: string;
    canLoadPlan: boolean;
    canDelete: boolean;
    date: Date | null;
  }> = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isAppLocalDataKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    const versionParts = getVersionParts(key, value);
    rows.push({
      key,
      label: getDataLabel(key),
      size: new Blob([value]).size,
      dateText: versionParts.dateText,
      timeText: versionParts.timeText,
      value,
      canLoadPlan: isLoadablePlanKey(key),
      canDelete: isDeletableKey(key),
      date: extractDateFromKey(key),
    });
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export default function AdminDashboard({
  onLoadSnapshot,
  onSaveFullSnapshot,
}: {
  onLoadSnapshot?: (configs: any, splicing: any, washes: any, jointSlots?: any, punchRecords?: any, jointCalibrationMarks?: any) => void;
  onSaveFullSnapshot?: () => void;
}) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedRow, setSelectedRow] = useState<ReturnType<typeof readLocalRows>[number] | null>(null);
  const rows = useMemo(() => readLocalRows(), [refreshTick]);

  const loadPlan = (row: ReturnType<typeof readLocalRows>[number]) => {
    try {
      const parsed = JSON.parse(row.value);
      const snapshot = parsed?.kind === "full_snapshot" && parsed?.snapshot
        ? parsed.snapshot
        : parsed;
      onLoadSnapshot?.(
        snapshot.lineConfigs,
        snapshot.activeSplicing,
        snapshot.lastWashes,
        snapshot.jointSlotConfigs,
        snapshot.punchRecords,
        snapshot.jointCalibrationMarks,
      );
    } catch {
      alert("这条本地数据解析失败，无法进入规划。");
    }
  };

  const deleteRow = (row: ReturnType<typeof readLocalRows>[number]) => {
    if (!row.canDelete) {
      alert("账号配置和当前登录状态不建议在这里删除。");
      return;
    }
    if (!window.confirm(`确定删除这条数据吗？\n\n${row.key}`)) return;
    localStorage.removeItem(row.key);
    if (!row.key.endsWith(LOCAL_BACKUP_SUFFIX)) {
      localStorage.removeItem(`${row.key}${LOCAL_BACKUP_SUFFIX}`);
    }
    if (selectedRow?.key === row.key) setSelectedRow(null);
    setRefreshTick((tick) => tick + 1);
  };

  const deleteOlderThanSevenDays = () => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 7);
    const keysToDelete = rows
      .filter((row) => row.canDelete && row.date && row.date.getTime() < cutoff.getTime())
      .map((row) => row.key);

    if (keysToDelete.length === 0) {
      alert("没有找到 7 天前的可删除数据。");
      return;
    }
    if (!window.confirm(`确定删除 7 天前的数据吗？共 ${keysToDelete.length} 条。`)) return;
    keysToDelete.forEach((key) => localStorage.removeItem(key));
    setSelectedRow(null);
    setRefreshTick((tick) => tick + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <Database size={24} />
            本地 JSON 数据
          </h2>
          <p className="text-sm font-bold text-slate-500 mt-1">
            这里显示本机浏览器保存的数据，不读取服务器。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onSaveFullSnapshot && (
            <button
              onClick={onSaveFullSnapshot}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-black flex items-center justify-center gap-2"
              type="button"
            >
              <Download size={14} />
              保存完整备份
            </button>
          )}
          <button
            onClick={deleteOlderThanSevenDays}
            className="px-4 py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-xs font-black flex items-center justify-center gap-2"
            type="button"
          >
            <CalendarX size={14} />
            删除7天前数据
          </button>
          <button
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center gap-2"
            type="button"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">数据项</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{rows.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">可进入规划</div>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {rows.filter((row) => row.canLoadPlan).length}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
          当前浏览器没有找到本工具保存的 JSON 数据。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">名称</th>
                  <th className="px-4 py-3 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-4">
                      <div className="text-slate-800 font-black whitespace-nowrap">
                        {row.label}
                      </div>
                      <div className="text-slate-600 font-mono text-sm mt-1 whitespace-nowrap">
                        {row.dateText}
                      </div>
                      {row.timeText && (
                        <div className="text-slate-400 font-mono text-xs mt-0.5 whitespace-nowrap">
                          {row.timeText}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.canLoadPlan && (
                          <button
                            onClick={() => loadPlan(row)}
                            className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                            type="button"
                          >
                            <ExternalLink size={12} />
                            进入此规划
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedRow(row)}
                          className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                          type="button"
                        >
                          <FileJson size={12} />
                          查看 JSON
                        </button>
                        {row.canDelete && (
                          <button
                            onClick={() => deleteRow(row)}
                            className="text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                            type="button"
                          >
                            <Trash2 size={12} />
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">{selectedRow.label}</h3>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5 break-all">
                  {selectedRow.key}
                </p>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-slate-400 hover:text-slate-600 p-1 text-xl"
                type="button"
              >
                x
              </button>
            </div>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2">
              {selectedRow.canLoadPlan && (
                <button
                  onClick={() => loadPlan(selectedRow)}
                  className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                  type="button"
                >
                  <ExternalLink size={12} />
                  进入此规划
                </button>
              )}
              {selectedRow.canDelete && (
                <button
                  onClick={() => deleteRow(selectedRow)}
                  className="text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                  type="button"
                >
                  <Trash2 size={12} />
                  删除这条数据
                </button>
              )}
            </div>
            <div className="p-4 overflow-auto flex-1 bg-slate-50">
              <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap">
                {safeFormatJson(selectedRow.value)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
