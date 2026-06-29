import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ChevronLeft, Save, Calculator, Divide } from "lucide-react";
import { cn } from "./lib/utils";

type RollRecord = {
  id: string;
  batchNo: string;
  length: number | "";
  previousLength?: number | "";
  startTime: string;
  splitTime: string;
  isLastRoll: boolean; // 如果是下班前最后一卷，不分卷/不卸卷
  speed: number | ""; // 车速(m/min)
  currentLength: number | ""; // 当前米数(m)
};

type LineSpeedPlan = {
  speed: number;
  speedSegments?: Array<{
    id?: string;
    startTime: string;
    speed: number;
  }>;
};

function createEmptyRecords(lines: string[]) {
  return lines.reduce<Record<string, RollRecord[]>>((acc, line) => {
    acc[line] = [];
    return acc;
  }, {});
}

const LOCAL_BACKUP_SUFFIX = "__backup";

function readLocalWithBackup(key: string, legacyKey?: string) {
  const keys = [key, `${key}${LOCAL_BACKUP_SUFFIX}`];
  if (legacyKey && legacyKey !== key) {
    keys.push(legacyKey, `${legacyKey}${LOCAL_BACKUP_SUFFIX}`);
  }
  for (const itemKey of keys) {
    const value = localStorage.getItem(itemKey);
    if (value !== null) {
      if (itemKey !== key) localStorage.setItem(key, value);
      return value;
    }
  }
  return null;
}

function writeLocalWithBackup(key: string, value: string) {
  localStorage.setItem(key, value);
  localStorage.setItem(`${key}${LOCAL_BACKUP_SUFFIX}`, value);
}

const SHIFT_DURATION_MINUTES = 12 * 60;
const MINUTES_PER_DAY = 24 * 60;

function parseClockMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hoursRaw) || !Number.isFinite(minutesRaw)) return null;
  return hoursRaw * 60 + minutesRaw;
}

function getShiftStartTimeFromEnd(shiftEndTime: "20:00" | "08:00") {
  return shiftEndTime === "20:00" ? "08:00" : "20:00";
}

function getMinutesFromShiftStart(clockTime: string, shiftStartTime: string) {
  const clockMinutes = parseClockMinutes(clockTime);
  const shiftStartMinutes = parseClockMinutes(shiftStartTime);
  if (clockMinutes === null || shiftStartMinutes === null) return null;
  let offset = clockMinutes - shiftStartMinutes;
  if (offset < 0) offset += MINUTES_PER_DAY;
  return offset;
}

export default function DailyRecordPage({
  setActivePage,
  lines,
  defaultSpeeds = {},
  lineSpeedPlans = {},
  storageKey = "daily_records_data",
}: {
  setActivePage: (page: any) => void;
  lines: string[];
  defaultSpeeds?: Record<string, number>;
  lineSpeedPlans?: Record<string, LineSpeedPlan>;
  storageKey?: string;
}) {
  const shiftStorageKey = `${storageKey}_shift`;
  const confirmedStorageKey = `${storageKey}_confirmed`;
  const [shiftEndTime, setShiftEndTime] = useState<"20:00" | "08:00">("20:00");
  const [confirmedLines, setConfirmedLines] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState<Record<string, RollRecord[]>>(() => createEmptyRecords(lines));
  const hydratedStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    hydratedStorageKeyRef.current = null;
    try {
      const savedRecords = readLocalWithBackup(storageKey, "daily_records_data");
      if (savedRecords) {
        const parsed = JSON.parse(savedRecords);
        setRecords({ ...createEmptyRecords(lines), ...parsed });
      } else {
        setRecords(createEmptyRecords(lines));
      }
      const savedShiftEndTime = readLocalWithBackup(shiftStorageKey, "daily_records_shift");
      if (savedShiftEndTime) {
        setShiftEndTime(savedShiftEndTime as "20:00" | "08:00");
      }
      const savedConfirmedLines = readLocalWithBackup(confirmedStorageKey, "daily_records_confirmed");
      if (savedConfirmedLines) {
        setConfirmedLines(JSON.parse(savedConfirmedLines));
      } else {
        setConfirmedLines({});
      }
    } catch (e) {
      console.error("Failed to parse saved data from localStorage", e);
    } finally {
      hydratedStorageKeyRef.current = storageKey;
    }
  }, [lines, storageKey, shiftStorageKey, confirmedStorageKey]);

  const getLineRecords = (lineId: string) => records[lineId] || [];

  useEffect(() => {
    if (hydratedStorageKeyRef.current !== storageKey) return;
    const timer = window.setTimeout(() => {
      writeLocalWithBackup(storageKey, JSON.stringify(records));
      writeLocalWithBackup(shiftStorageKey, shiftEndTime);
      writeLocalWithBackup(confirmedStorageKey, JSON.stringify(confirmedLines));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [records, shiftEndTime, confirmedLines, storageKey, shiftStorageKey, confirmedStorageKey]);

  const getDefaultSpeed = (lineId: string) => {
    const speed = Number(defaultSpeeds[lineId]);
    return Number.isFinite(speed) && speed > 0 ? speed : "";
  };

  const getLineSpeedPlan = (lineId: string): LineSpeedPlan => {
    const plan = lineSpeedPlans[lineId];
    const fallbackSpeed = Number(getDefaultSpeed(lineId));
    const speed = Number(plan?.speed);
    return {
      speed: Number.isFinite(speed) && speed > 0
        ? speed
        : Number.isFinite(fallbackSpeed) && fallbackSpeed > 0
          ? fallbackSpeed
          : 0,
      speedSegments: Array.isArray(plan?.speedSegments) ? plan.speedSegments : [],
    };
  };

  const getShiftSpeedSchedule = (lineId: string) => {
    const shiftStartTime = getShiftStartTimeFromEnd(shiftEndTime);
    const plan = getLineSpeedPlan(lineId);
    const baseSpeed = Number(plan.speed);
    if (!Number.isFinite(baseSpeed) || baseSpeed <= 0) return [];

    const schedule = [
      {
        id: "base",
        offset: 0,
        startTime: shiftStartTime,
        speed: baseSpeed,
      },
      ...(plan.speedSegments || [])
        .map((segment) => {
          const offset = getMinutesFromShiftStart(segment.startTime, shiftStartTime);
          const speed = Number(segment.speed);
          if (
            offset === null ||
            offset < 0 ||
            offset >= SHIFT_DURATION_MINUTES ||
            !Number.isFinite(speed) ||
            speed <= 0
          ) {
            return null;
          }
          return {
            id: segment.id || `${segment.startTime}-${speed}`,
            offset,
            startTime: segment.startTime,
            speed,
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          offset: number;
          startTime: string;
          speed: number;
        }>,
    ].sort((a, b) => a.offset - b.offset);

    return schedule;
  };

  const calculateTheoreticalShiftLength = (lineId: string) => {
    const schedule = getShiftSpeedSchedule(lineId);
    if (schedule.length === 0) return null;
    return schedule.reduce((total, segment, index) => {
      const nextOffset = schedule[index + 1]?.offset ?? SHIFT_DURATION_MINUTES;
      const minutes = Math.max(0, nextOffset - segment.offset);
      return total + minutes * segment.speed;
    }, 0);
  };

  const hasCompletedFinalRoll = (lineId: string) => {
    const lineRecords = getLineRecords(lineId);
    const finalIndex = lineRecords.length - 1;
    const finalRoll = finalIndex >= 0 ? lineRecords[finalIndex] : null;
    return Boolean(
      finalRoll?.isLastRoll &&
      getOwnLength(lineId, finalRoll, finalIndex) > 0,
    );
  };

  const getProductionAudit = (lineId: string) => {
    const theoretical = calculateTheoreticalShiftLength(lineId);
    const actual = calculateOwnTotalLength(lineId);
    const hasRecordLength = getLineRecords(lineId).some((roll, index) => getOwnLength(lineId, roll, index) > 0);
    const hasFinalRoll = hasCompletedFinalRoll(lineId);
    const diff = theoretical === null ? null : actual - theoretical;
    const absDiff = diff === null ? 0 : Math.abs(diff);
    const tone = !hasFinalRoll || !hasRecordLength || diff === null
      ? "empty"
      : absDiff <= 10
        ? "ok"
        : absDiff <= 20
          ? "warn"
          : "bad";

    return {
      actual,
      theoretical,
      diff,
      hasRecordLength,
      hasFinalRoll,
      tone,
    };
  };

  const getOwnLength = (lineId: string, roll: RollRecord, index: number) => {
    const total = parseFloat(String(roll.length));
    if (isNaN(total)) return 0;
    if (index !== 0) return total;
    const previous = parseFloat(String(roll.previousLength || 0));
    return Math.max(0, total - (isNaN(previous) ? 0 : previous));
  };

  const calculateOwnTotalLength = (lineId: string) => {
    return getLineRecords(lineId).reduce(
      (acc, curr, index) => acc + getOwnLength(lineId, curr, index),
      0,
    );
  };

  const handleAddRoll = (lineId: string) => {
    if (confirmedLines[lineId]) {
      setConfirmedLines((prev) => ({ ...prev, [lineId]: false }));
    }
    const prevRolls = getLineRecords(lineId);
    const lastRoll = prevRolls.length > 0 ? prevRolls[prevRolls.length - 1] : null;
    
    const newRoll: RollRecord = {
      id: Math.random().toString(36).substring(7),
      batchNo: "",
      length: "",
      previousLength: "",
      startTime: lastRoll?.splitTime || "",
      splitTime: "",
      isLastRoll: false,
      speed: getDefaultSpeed(lineId),
      currentLength: "",
    };
    setRecords((prev) => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), newRoll],
    }));
  };

  const handleRemoveRoll = (lineId: string, id: string) => {
    setRecords((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter((r) => r.id !== id),
    }));
  };

  const handleUpdateRoll = (
    lineId: string,
    id: string,
    field: keyof RollRecord,
    value: any
  ) => {
    setRecords((prev) => {
      const lineRecords = [...(prev[lineId] || [])];
      const index = lineRecords.findIndex((r) => r.id === id);
      if (index === -1) return prev;

      lineRecords[index] = { ...lineRecords[index], [field]: value };

      // If we update splitTime, auto-update the next roll's startTime
      if (field === "splitTime" && index < lineRecords.length - 1) {
        lineRecords[index + 1] = { ...lineRecords[index + 1], startTime: value };
      }

      return {
        ...prev,
        [lineId]: lineRecords,
      };
    });
  };

  const calculateTotalLength = (lineId: string) => {
    return getLineRecords(lineId).reduce((acc, curr) => {
      const val = parseFloat(String(curr.length));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  };

  const calculateLastRoll = (lineId: string, roll: RollRecord) => {
    const speed = roll.speed !== "" ? Number(roll.speed) : Number(getDefaultSpeed(lineId));
    if (speed > 0 && roll.currentLength !== "") {
      const now = new Date();
      const currH = now.getHours();
      const currM = now.getMinutes();
      
      const [endH, endM] = shiftEndTime.split(":").map(Number);
      
      let currTimeMins = currH * 60 + currM;
      let endTimeMins = endH * 60 + endM;
      
      // 处理跨天情况
      if (endTimeMins < currTimeMins) {
        endTimeMins += 24 * 60;
      }
      
      const diffMins = endTimeMins - currTimeMins;
      const calcLen = Number(roll.currentLength) + speed * diffMins;
      
      handleUpdateRoll(lineId, roll.id, "length", calcLen.toFixed(1));
      alert(`计算完成！\n距离下班还有 ${Math.floor(diffMins / 60)}小时${diffMins % 60}分钟。\n最后一卷预计到达：${calcLen.toFixed(1)} m`);
    } else {
      alert("请填写完整：车速、当前已产生米数");
    }
  };

  return (
    <div className="bg-slate-50 flex-1 overflow-auto p-4 sm:p-6 sm:rounded-3xl shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <button
            onClick={() => setActivePage("dashboard")}
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors shrink-0 flex items-center gap-1"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="w-10 h-10 shrink-0 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 hidden sm:flex">
            <Calculator size={20} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
              当天工作数据独立记录
            </h2>
            <div className="text-sm font-bold text-slate-500 mt-0.5">
              用于记录和计算今日各线生产的拉伸米数与起卸时间
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex bg-slate-200 p-1 rounded-lg stretch self-start">
            <button
              onClick={() => setShiftEndTime("08:00")}
              className={cn("flex-1 px-3 py-1.5 rounded-md text-sm font-bold transition-colors", shiftEndTime === "08:00" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >早上8点下班</button>
            <button
              onClick={() => setShiftEndTime("20:00")}
              className={cn("flex-1 px-3 py-1.5 rounded-md text-sm font-bold transition-colors", shiftEndTime === "20:00" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >晚上8点下班</button>
          </div>
          <button
            onClick={() => {
              writeLocalWithBackup(storageKey, JSON.stringify(records));
              writeLocalWithBackup(shiftStorageKey, shiftEndTime);
              writeLocalWithBackup(confirmedStorageKey, JSON.stringify(confirmedLines));
              alert("数据已暂存于本地内存中。");
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm transition-colors shadow-sm"
          >
          <Save size={16} />
          <span className="inline">暂存记录</span>
        </button>
      </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {lines.map((lineId) => (
          <div
            key={lineId}
            className="bg-white border text-left border-slate-200 rounded-2xl p-4 shadow-sm"
          >
            {(() => {
              const audit = getProductionAudit(lineId);
              const shiftStartTime = getShiftStartTimeFromEnd(shiftEndTime);
              return (
                <>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-black text-sm flex items-center justify-center">
                        {lineId}#
                      </span>
                      <span className="font-bold text-slate-700">产线记录</span>
                    </div>
                    <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                      我产合计: {audit.actual.toFixed(1)} m
                    </span>
                  </div>

                  {audit.hasFinalRoll && (
                    <div
                      className={cn(
                        "mb-4 rounded-xl border p-3",
                        audit.tone === "bad"
                          ? "border-red-200 bg-red-50"
                          : audit.tone === "warn"
                            ? "border-amber-200 bg-amber-50"
                            : audit.tone === "ok"
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                          <Divide size={14} />
                          班次产量核对
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">
                          {shiftStartTime}-{shiftEndTime}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/70 px-2 py-2">
                          <div className="text-[10px] font-bold text-slate-500">理论</div>
                          <div className="mt-0.5 text-sm font-black text-slate-800">
                            {audit.theoretical === null ? "--" : `${audit.theoretical.toFixed(1)}m`}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2 py-2">
                          <div className="text-[10px] font-bold text-slate-500">实际</div>
                          <div className="mt-0.5 text-sm font-black text-indigo-700">
                            {audit.hasRecordLength ? `${audit.actual.toFixed(1)}m` : "--"}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2 py-2">
                          <div className="text-[10px] font-bold text-slate-500">偏差</div>
                          <div
                            className={cn(
                              "mt-0.5 text-sm font-black",
                              audit.tone === "bad"
                                ? "text-red-700"
                                : audit.tone === "warn"
                                  ? "text-amber-700"
                                  : audit.tone === "ok"
                                    ? "text-emerald-700"
                                    : "text-slate-400",
                            )}
                          >
                            {audit.diff === null || !audit.hasRecordLength
                              ? "--"
                              : `${audit.diff >= 0 ? "+" : ""}${audit.diff.toFixed(1)}m`}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] font-bold text-slate-500">
                        按工作台车速段计算理论米数；偏差超过 10m 会变色提醒。
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="space-y-3">
             <div className="hidden sm:grid grid-cols-[1.5fr_0.8fr_1fr_1fr_auto] gap-2 px-2 text-xs font-bold text-slate-400">
                <div>批次号</div>
                <div>我产米数(m)</div>
                <div>起卷时间</div>
                <div>分卸状态/时间</div>
                <div className="w-6"></div>
              </div>

              {getLineRecords(lineId).length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm font-bold bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  暂无记录
                </div>
              ) : (
                getLineRecords(lineId).map((r, index) => (
                  <div key={r.id} className="flex flex-col gap-2">
                    <div
                      className={cn(
                        "grid grid-cols-[1.5fr_1fr] sm:grid-cols-[1.5fr_0.8fr_1fr_1fr_auto] gap-x-2 gap-y-3 sm:gap-2 transition-colors relative pt-6 sm:pt-2",
                        confirmedLines[lineId] 
                          ? "py-2 items-center border-b border-slate-100 last:border-0 pt-2 sm:pt-2" 
                          : cn(
                              "items-start p-3 sm:p-2 rounded-xl",
                              r.isLastRoll ? "bg-amber-50/50 border border-amber-100" : "bg-slate-50/50 border border-slate-100 hover:bg-slate-50"
                            )
                      )}
                    >
                      <div className="w-full space-y-1">
                        {!confirmedLines[lineId] && <label className="sm:hidden text-[10px] font-bold text-slate-400">批次号</label>}
                        {confirmedLines[lineId] ? (
                          <div className="text-[13px] font-bold text-slate-700 py-1.5">{r.batchNo || "-"}</div>
                        ) : (
                          <input
                            type="text"
                            placeholder="批次"
                            value={r.batchNo}
                            onChange={(e) =>
                              handleUpdateRoll(lineId, r.id, "batchNo", e.target.value.toUpperCase())
                            }
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-[13px] font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                          />
                        )}
                      </div>
                      
                      <div className="w-full space-y-1">
                        {!confirmedLines[lineId] && <label className="sm:hidden text-[10px] font-bold text-slate-400">米数(m)</label>}
                        {confirmedLines[lineId] ? (
                          <div className="text-[13px] font-bold text-indigo-600 py-1.5">
                            {r.length ? (
                              <div className="flex flex-col leading-tight">
                                <span>我产 {getOwnLength(lineId, r, index).toFixed(1)} m</span>
                                {index === 0 && (
                                  <span className="text-[10px] text-slate-500">
                                    同事 {Number(r.previousLength || 0).toFixed(1)} m / 本卷总 {r.length} m
                                  </span>
                                )}
                              </div>
                            ) : "-"}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-indigo-500 block">
                              {index === 0 ? "本卷总米数（我 + 上班同事）" : "我生产的米数"}
                            </label>
                            <input
                              type="number"
                              placeholder={index === 0 ? "本卷总米数" : "我生产的米数"}
                              value={r.length}
                              onChange={(e) =>
                                handleUpdateRoll(lineId, r.id, "length", e.target.value)
                              }
                              step="0.1"
                              className="w-full bg-white border border-slate-200 text-indigo-700 rounded p-1.5 text-[13px] font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                            {index === 0 && (
                              <div>
                                <label className="text-[10px] font-bold text-amber-600 block">
                                  上班同事已生产米数
                                </label>
                                <input
                                  type="number"
                                  placeholder="只填同事已生产"
                                  value={r.previousLength || ""}
                                  onChange={(e) =>
                                    handleUpdateRoll(lineId, r.id, "previousLength", e.target.value)
                                  }
                                  step="0.1"
                                  className="w-full bg-amber-50 border border-amber-200 text-amber-700 rounded p-1.5 text-[12px] font-bold shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="w-full space-y-1">
                        {!confirmedLines[lineId] && <label className="sm:hidden text-[10px] font-bold text-slate-400">起卷时间</label>}
                        {confirmedLines[lineId] ? (
                          <div className="text-[13px] font-bold text-slate-700 py-1.5">{r.startTime || "-"}</div>
                        ) : (
                          <input
                            type="time"
                            value={r.startTime}
                            onChange={(e) =>
                              handleUpdateRoll(lineId, r.id, "startTime", e.target.value)
                            }
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-[13px] font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        )}
                      </div>

                      <div className="flex flex-col gap-1 w-full relative sm:mt-0 mt-1">
                        {!confirmedLines[lineId] && <label className="sm:hidden text-[10px] font-bold text-slate-400">分卸状态/时间</label>}
                        
                        {confirmedLines[lineId] ? (
                          <div className="text-[13px] font-bold text-slate-700 py-1.5">
                            {r.isLastRoll ? <span>{shiftEndTime}</span> : (r.splitTime || "-")}
                          </div>
                        ) : (
                          <>
                            {!r.isLastRoll && (
                               <input
                                 type="time"
                                 value={r.splitTime}
                                 onChange={(e) =>
                                   handleUpdateRoll(lineId, r.id, "splitTime", e.target.value)
                                 }
                                 className="w-full bg-white border border-slate-200 rounded p-1.5 text-[13px] font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                               />
                            )}
                            {index === getLineRecords(lineId).length - 1 && (
                              <label className={cn("flex items-center gap-1 cursor-pointer mt-0.5", r.isLastRoll && "h-8")}>
                                <input 
                                  type="checkbox"
                                  checked={r.isLastRoll}
                                  onChange={(e) => {
                                    handleUpdateRoll(lineId, r.id, "isLastRoll", e.target.checked);
                                    if (e.target.checked && r.speed === "") {
                                      handleUpdateRoll(lineId, r.id, "speed", getDefaultSpeed(lineId));
                                    }
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">最后一卷不卸卷</span>
                              </label>
                            )}
                          </>
                        )}
                      </div>

                      {!confirmedLines[lineId] && (
                        <button
                          onClick={() => handleRemoveRoll(lineId, r.id)}
                          className="absolute right-2 top-2 sm:relative sm:right-auto sm:top-auto w-6 h-6 sm:w-6 sm:h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {r.isLastRoll && !confirmedLines[lineId] && (
                      <div className="ml-2 pl-3 border-l-2 border-indigo-200 py-1 grid grid-cols-2 sm:grid-cols-3 gap-2 items-end bg-indigo-50/30 rounded-r-lg">
                        <div>
                          <label className="block text-[10px] font-bold text-indigo-800/70 mb-1">车速(m/min)</label>
                          <input
                            type="number"
                            value={r.speed === "" ? getDefaultSpeed(lineId) : r.speed}
                            onChange={(e) => handleUpdateRoll(lineId, r.id, "speed", e.target.value)}
                            className="w-full bg-white border border-indigo-200 text-indigo-700 rounded p-1.5 text-xs font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-indigo-800/70 mb-1">当前米数(m)</label>
                          <input
                            type="number"
                            value={r.currentLength}
                            onChange={(e) => handleUpdateRoll(lineId, r.id, "currentLength", e.target.value)}
                            className="w-full bg-white border border-indigo-200 text-indigo-700 rounded p-1.5 text-xs font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <button
                          onClick={() => calculateLastRoll(lineId, r)}
                          className="h-[28px] w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors shadow-sm mb-[1px]"
                        >
                          计算到下班
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
              
              <button
                onClick={() => handleAddRoll(lineId)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 font-bold text-sm"
              >
                <Plus size={16} />
                添加卷记录
              </button>

              {getLineRecords(lineId).length > 0 && (
                <button
                  onClick={() => setConfirmedLines(prev => ({...prev, [lineId]: !prev[lineId]}))}
                  className={cn(
                    "w-full py-2.5 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-sm transition-colors",
                    confirmedLines[lineId] 
                      ? "border-slate-200 text-slate-600 bg-slate-100 hover:bg-slate-200" 
                      : "border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  )}
                >
                  {confirmedLines[lineId] ? "编辑批次数据" : "确认所有批次数据"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
