import React, { useState, useEffect, useRef } from "react";
import AdminDashboard from "./AdminDashboard";
import { SettingsPage } from "./SettingsPage";
import { useAuth } from "./AuthContext";
import { db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./firestoreErrorHandler";
import {
  format,
  differenceInMinutes,
  addMinutes,
  differenceInDays,
  startOfDay,
  addDays,
  getHours,
} from "date-fns";
import {
  LayoutDashboard,
  Route,
  Activity,
  CalendarDays,
  Package,
  Clock,
  AlertCircle,
  Droplets,
  Wrench,
  Scissors,
  FastForward,
  CheckSquare,
  ListTodo,
  AlertTriangle,
  Settings2,
  Trash2,
  Plus,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Database,
} from "lucide-react";
import { cn } from "./lib/utils";

export interface MealConfig {
  lunchStart: number;
  lunchEnd: number;
  dinnerStart: number;
  dinnerEnd: number;
}

export function checkMealConflict(date: Date, meals: MealConfig) {
  const h = date.getHours();
  const m = date.getMinutes();
  const t = h + m / 60;
  if (t >= meals.lunchStart && t <= meals.lunchEnd) return "午间进餐";
  if (t >= meals.dinnerStart && t <= meals.dinnerEnd) return "晚间进餐";
  if (t >= 23.583 || t <= 1.083) return "夜间进餐(前半夜)";
  if (t >= 5.166 && t <= 6.666) return "夜间进餐(后半夜)";
  return null;
}

function TimelineRoll({
  r,
  leftPct,
  wPct,
  lineId,
  onChangeLength,
}: {
  key?: React.Key;
  r: any;
  leftPct: number;
  wPct: number;
  lineId: string;
  onChangeLength: (id: string, newLength: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startLength = r.targetFormedLength;

    const container = containerRef.current?.parentElement?.parentElement;
    if (!container) return;
    const containerWidth = container.clientWidth;

    const handleMouseMove = (e2: MouseEvent) => {
      const dx = e2.clientX - startX;
      const minsChange = (dx / containerWidth) * 720;
      const lengthChange = minsChange * (r.speed || 1.3);

      onChangeLength(r.id, startLength + lengthChange);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute top-[1px] bottom-[1px] overflow-visible z-10",
        r.isJoint ? "z-20" : "",
      )}
      style={{
        left: `${Math.max(0, leftPct)}%`,
        width: `${Math.min(100 - Math.max(0, leftPct), wPct - (leftPct < 0 ? -leftPct : 0))}%`,
      }}
    >
      {/* Separator / Drag Handle */}
      {leftPct + wPct <= 100 && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute right-0 top-0 bottom-0 w-2 translate-x-1/2 cursor-ew-resize hover:bg-blue-500/50 z-20 flex items-center justify-center"
        >
          <div className={cn("w-[2px] h-full", r.isJoint ? "bg-orange-500" : "bg-blue-500")} />
        </div>
      )}

      {/* Markers */}
      {leftPct + wPct <= 100 && (
        <div className="absolute right-0 bottom-full mb-0.5 whitespace-nowrap pointer-events-none flex flex-col items-center z-30 translate-x-1/2">
          {r.isJoint ? (
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-black text-orange-700 bg-orange-100 border border-orange-300 px-1.5 py-0.5 rounded shadow-sm mb-0.5 flex flex-col items-center leading-tight outline outline-2 outline-white">
                <span className="font-mono text-[9px] mb-0.5">{r.endTime.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'})}</span>
                <span className="opacity-90">{r.targetFormedLength.toFixed(1)}m</span>
              </div>
              <div className="text-[8.5px] font-bold text-orange-600 bg-white px-1 -mb-0.5 rounded relative z-10 border border-orange-200">末端接头必分卷</div>
              <div className="w-[1.5px] h-2 bg-orange-500"></div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-300 px-1.5 py-0.5 rounded shadow-sm mb-0.5 flex flex-col items-center leading-tight outline outline-2 outline-white">
                <span className="font-mono text-[9px] mb-0.5">{r.endTime.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'})}</span>
                <span className="opacity-90">{r.targetFormedLength.toFixed(1)}m</span>
              </div>
              <div className="text-[8.5px] font-bold text-blue-500 bg-white px-1 -mb-0.5 rounded relative z-10 border border-blue-200">分卷</div>
              <div className="w-[1.5px] h-2 bg-blue-500"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function getCurrentShiftStart(time: Date) {
  const h = time.getHours();
  if (h >= 8 && h < 20) {
    const start = new Date(time);
    start.setHours(8, 0, 0, 0);
    return start;
  } else {
    const start = new Date(time);
    if (h < 8) {
      start.setDate(start.getDate() - 1);
    }
    start.setHours(20, 0, 0, 0);
    return start;
  }
}

export function getPlanningShiftStart(time: Date) {
  const h = time.getHours();
  // 提前准备，比如17点以后就算作准备当晚20点的夜班，早上5点以后算作准备8点的白班
  if (h >= 5 && h < 17) {
    const start = new Date(time);
    start.setHours(8, 0, 0, 0);
    return start;
  } else {
    const start = new Date(time);
    if (h < 5) {
      start.setDate(start.getDate() - 1);
    }
    start.setHours(20, 0, 0, 0);
    return start;
  }
}

export function getCurrentShiftEnd(time: Date) {
  const h = time.getHours();
  if (h >= 8 && h < 20) {
    const end = new Date(time);
    end.setHours(20, 0, 0, 0);
    return end;
  } else {
    const end = new Date(time);
    if (h >= 20) {
      end.setDate(end.getDate() + 1);
    }
    end.setHours(8, 0, 0, 0);
    return end;
  }
}

// --- Shift Logic ---
const ANCHOR_DATE_DAY1_YI = new Date("2026-04-28T00:00:00"); // 乙班 Day 1

function getShiftInfo(date: Date) {
  const diffDays = differenceInDays(startOfDay(date), ANCHOR_DATE_DAY1_YI);
  const cycleDay = ((diffDays % 6) + 6) % 6;

  // 0: 白班1, 1: 白班2, 2: 夜班1, 3: 夜班2, 4: 休息1, 5: 休息2
  let type: "Day" | "Night" | "Rest" = "Rest";
  let name = "";
  let timeStr = "";
  let startHour = 0;

  if (cycleDay === 0 || cycleDay === 1) {
    type = "Day";
    name = `白班 Day ${cycleDay + 1}/2`;
    timeStr = "08:00 - 20:00";
    startHour = 8;
  } else if (cycleDay === 2 || cycleDay === 3) {
    type = "Night";
    name = `夜班 Night ${cycleDay - 1}/2`;
    timeStr = "20:00 - 08:00";
    startHour = 20; // Starts previous evening theoretically, but for shift mapping 20:00
  } else {
    type = "Rest";
    name = `休息与调整 Rest ${cycleDay - 3}/2`;
    timeStr = "全天休息";
  }

  return { type, name, timeStr, cycleDay, startHour };
}

// --- Shift Logic for Punches ---
function getRelevantShifts(now: Date) {
  const today = startOfDay(now);
  const ytd = addDays(today, -1);
  const tmw = addDays(today, 1);

  const shifts: Array<{ id: string; name: string; start: Date; end: Date }> =
    [];
  [ytd, today, tmw].forEach((d) => {
    const info = getShiftInfo(d);
    if (info.type === "Day") {
      shifts.push({
        id: format(d, "yyyy-MM-dd") + "-Day",
        name: info.name,
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0),
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0),
      });
    } else if (info.type === "Night") {
      shifts.push({
        id: format(d, "yyyy-MM-dd") + "-Night",
        name: info.name,
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0),
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0),
      });
    }
  });
  return shifts;
}

// --- Mock Initial State ---
const LINES = ["24", "25", "26"] as const;
type LineId = (typeof LINES)[number];

// 预留一些占位工艺段名称
const STAGES = ["预留入口", "预处理", "A段化成", "B段化成", "收尾预留"];

interface PlannedRoll {
  id: string;
  targetFormedLength: number;
  isJoint: boolean;
  batchNumber?: string;
  formedBatchNo?: string;
  etchedLength?: string;
  jointTime?: string;
  jointPosition?: string;
  isCompleted?: boolean;
  actualLength?: number;
}

interface FutureRoll {
  id: string;
  batchNo: string;
  length: number;
}

interface CompletedRoll {
  id: string;
  batchNo: string;
  corrosionBatchNo?: string;
  length: number;
  unrollTime: string;
  isManual?: boolean;
}

interface LinePlanConfig {
  cTotal: number;
  cUsed: number;
  cPrevUsed?: number;
  fProduced: number;
  fPrevProduced?: number;
  batchNo?: string;
  speed: number;
  futureRolls?: FutureRoll[];
  completedRolls?: CompletedRoll[];
  rolls: PlannedRoll[];
}

interface SplicingTask {
  id: string;
  line: LineId;
  startTime: Date;
  status: "splicing" | "waiting_rack" | "passing_rack" | "done";
}

interface WashLog {
  id: string;
  line: LineId;
  time: Date;
  duration: number;
}

function CombinedPlanTimeline({
  lineConfigs,
  updateConfig,
  currentTime,
  rollCompletionInputs,
  setRollCompletionInputs,
  rollCompletionTimeInputs,
  setRollCompletionTimeInputs,
  handleCompleteRoll,
}: {
  lineConfigs: Record<LineId, LinePlanConfig>;
  updateConfig: (id: LineId, c: LinePlanConfig) => void;
  currentTime: Date;
  rollCompletionInputs: Record<LineId, string>;
  setRollCompletionInputs: React.Dispatch<React.SetStateAction<Record<LineId, string>>>;
  rollCompletionTimeInputs: Record<LineId, string>;
  setRollCompletionTimeInputs: React.Dispatch<React.SetStateAction<Record<LineId, string>>>;
  handleCompleteRoll: (lineId: LineId) => void;
}) {
  const lines = ["24", "25", "26"] as LineId[];

  // Calculate 12-hour shift window
  const shiftStart = getCurrentShiftStart(currentTime);
  const shiftEnd = getCurrentShiftEnd(currentTime);
  const maxMinutes = differenceInMinutes(shiftEnd, shiftStart); // Typically 720

  const updateRollProp = (
    lineId: LineId,
    idx: number,
    prop: keyof PlannedRoll,
    val: any,
  ) => {
    const c = lineConfigs[lineId];
    const newRolls = [...c.rolls];
    newRolls[idx] = { ...newRolls[idx], [prop]: val };
    updateConfig(lineId, { ...c, rolls: newRolls });
  };

  return (
    <div className="mb-6 flex flex-col gap-6 w-full max-w-full">
      {/* The Unified Timeline Chart */}
      <div className="-mx-4 sm:mx-0 w-[calc(100%+32px)] sm:w-full overflow-x-auto hide-scrollbar sm:rounded-xl border-y sm:border border-slate-200 bg-slate-50 sm:shadow-inner relative z-0">
        <div className="relative w-full text-slate-700 py-4 sm:py-6 pl-2 pr-2 sm:px-0">
          
          <div className="absolute top-0 bottom-0 left-4 right-4 pointer-events-none z-0">
            {/* Ticks */}
            <div className="absolute inset-0 border-l-2 border-slate-300 border-dashed">
              {[0.25, 0.5, 0.75].map((pct) => (
                <div
                  key={pct}
                  className="absolute top-0 bottom-0 border-l border-slate-200 border-dashed"
                  style={{ left: `${pct * 100}%` }}
                ></div>
              ))}
            </div>

            {/* Current Time Line */}
            <div
              className="absolute top-8 bottom-0 border-l-2 border-blue-400 border-dashed z-0"
              style={{
                left: `${Math.max(0, Math.min(100, (differenceInMinutes(currentTime, shiftStart) / maxMinutes) * 100))}%`
              }}
            ></div>
            
            {/* Labels */}
            <div className="absolute top-0 left-0 right-0 h-6 text-[10px] text-slate-400 font-bold flex items-start">
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                let transform = "-translate-x-1/2";
                if (pct === 0) transform = "";
                if (pct === 1) transform = "-translate-x-full";
                
                return (
                  <div
                    key={pct}
                    className={`absolute whitespace-nowrap ${transform}`}
                    style={{ left: `${pct * 100}%` }}
                  >
                    {format(addMinutes(shiftStart, maxMinutes * pct), "HH:mm")}
                  </div>
                );
              })}
              {/* Current Time Indicator Text */}
              {(() => {
                const pct = Math.max(0, Math.min(1, differenceInMinutes(currentTime, shiftStart) / maxMinutes));
                let transform = "-translate-x-1/2";
                if (pct < 0.05) transform = "";
                if (pct > 0.95) transform = "-translate-x-full";
                return (
                  <div
                    className={`absolute whitespace-nowrap text-blue-500 top-4 bg-slate-50 px-1 rounded z-10 font-bold ${transform}`}
                    style={{ left: `${pct * 100}%` }}
                  >
                    现在 {format(currentTime, "HH:mm")}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="mt-8 space-y-5 relative z-10 w-full px-4">

          {lines.map((lineId) => {
            const config = lineConfigs[lineId];
            let totalToForm = config.fProduced + config.cTotal - config.cUsed;
            if (config.futureRolls) {
              totalToForm += config.futureRolls.reduce((a, r) => a + r.length, 0);
            }
            const minL = lineId === "25" ? 300 : 400;
            const maxL = lineId === "25" ? 800 : 550;

            const cumSum: number[] = [];
            let acc = 0;
            config.rolls.forEach((r) => {
              acc += r.targetFormedLength;
              cumSum.push(acc);
            });

            return (
              <div key={lineId} className="flex flex-col group relative w-full mb-14">
                <div className="flex items-center gap-1.5 mb-1.5 sticky left-0 z-20 w-fit mix-blend-multiply">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="font-black text-slate-800 text-xs sm:text-sm">{lineId}# 线</span>
                </div>
                <div className="relative h-10 sm:h-12 rounded-lg border border-slate-200 shadow-sm bg-white">
                  <div className="absolute inset-0 overflow-hidden rounded-lg"></div>
                  <div className="relative h-full w-full pointer-events-auto transition-opacity z-10">
                    <DraggableTimelineLine
                      lineId={lineId}
                      config={config}
                      cumSum={cumSum}
                      totalToForm={totalToForm}
                      updateConfig={updateConfig}
                      currentTime={currentTime}
                      shiftStart={shiftStart}
                      minL={minL}
                      maxL={maxL}
                      maxMinutes={maxMinutes}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Inputs grid - one column per line */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {lines.map((lineId) => {
          const config = lineConfigs[lineId];
          return (
            <div key={"inputs-" + lineId} className="space-y-4">
              <h4 className="font-bold text-slate-700 flex items-center gap-2 pb-2 border-b">
                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">
                  {lineId}# 线配置
                </span>
              </h4>
              {(config.rolls.length > 0 || (config.completedRolls && config.completedRolls.length > 0)) ? (
                <div className="flex flex-col gap-4">
                  {(() => {
                    const groups: { batchNumber: string; rolls: (PlannedRoll & { index: number, endT: Date })[] }[] = [];
                    let currentGroup: any = null;

                    // Add completed rolls first
                    if (config.completedRolls) {
                      config.completedRolls.forEach((cr, i) => {
                        const batchNo = cr.corrosionBatchNo || "无批号";
                        if (!currentGroup || currentGroup.batchNumber !== batchNo) {
                          if (currentGroup) groups.push(currentGroup);
                          currentGroup = { batchNumber: batchNo, rolls: [] };
                        }
                        currentGroup.rolls.push({
                          id: cr.id,
                          targetFormedLength: cr.length,
                          isJoint: false,
                          batchNumber: cr.corrosionBatchNo,
                          formedBatchNo: cr.batchNo,
                          index: -1 - i,
                          endT: new Date(cr.unrollTime),
                          isCompleted: true,
                          actualLength: cr.length,
                        });
                      });
                    }

                    let accC = 0;
                    config.rolls.forEach((roll, i) => {
                      const cConsum = i === 0 ? Math.max(0, roll.targetFormedLength - config.fProduced) : roll.targetFormedLength;
                      accC += cConsum;
                      const endT = new Date(currentTime.getTime() + (accC / config.speed) * 60000);
                      
                      const batchNo = roll.batchNumber || "无批号";
                      if (!currentGroup || currentGroup.batchNumber !== batchNo) {
                        if (currentGroup) groups.push(currentGroup);
                        currentGroup = { batchNumber: batchNo, rolls: [] };
                      }
                      currentGroup.rolls.push({ ...roll, index: i, endT });
                    });
                    if (currentGroup) groups.push(currentGroup);

                    const groupColors = [
                      "bg-blue-50/50 border-blue-100",
                      "bg-indigo-50/50 border-indigo-100",
                      "bg-emerald-50/50 border-emerald-100",
                      "bg-amber-50/50 border-amber-100",
                      "bg-purple-50/50 border-purple-100"
                    ];

                    return groups.map((group, groupIdx) => {
                       const colorClass = groupColors[groupIdx % groupColors.length];
                       return (
                         <div key={groupIdx} className={cn("p-3 rounded-2xl border", colorClass)}>
                           <div className="text-xs font-bold text-slate-700 mb-3 px-1 flex items-center gap-2">
                             <div className="bg-white px-2 py-1.5 rounded shadow-sm border border-slate-200 flex items-center gap-2">
                               <span className="shrink-0">腐蚀箔批号:</span>
                               <input
                                 type="text"
                                 className="bg-transparent border-none text-slate-700 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-32"
                                 value={group.batchNumber === "无批号" ? "" : group.batchNumber}
                                 placeholder="未指定"
                                 onChange={(e) => {
                                   const c = lineConfigs[lineId];
                                   const newRolls = [...c.rolls];
                                   group.rolls.forEach(r => {
                                     newRolls[r.index] = { ...newRolls[r.index], batchNumber: e.target.value };
                                   });
                                   updateConfig(lineId, { ...c, rolls: newRolls });
                                 }}
                               />
                             </div>
                           </div>
                           <div className="flex flex-col gap-3">
                             {group.rolls.map((roll) => (
                               <div
                                 key={roll.id}
                                 className={cn("transition-colors py-3 px-4 rounded-xl border shadow-sm relative", roll.isCompleted ? "bg-slate-50 border-slate-300 opacity-80" : "bg-white hover:bg-slate-50 border-slate-200")}
                               >
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-slate-700 bg-slate-100 flex flex-wrap items-center rounded text-xs border border-slate-200 overflow-hidden shadow-sm">
                                      <span className="px-2 py-1 bg-slate-200/50 flex items-center gap-1.5">
                                        <span>{roll.isCompleted ? "✅ 已卸卷" : `卷 #${roll.index + 1}`}</span>
                                        {roll.isJoint && !roll.isCompleted && (
                                          <span className="bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-sm whitespace-nowrap shadow-sm">末端接头必分卷</span>
                                        )}
                                      </span>
                                      <input
                                        type="text"
                                        placeholder="化成箔批号"
                                        disabled={roll.isCompleted}
                                        className="bg-transparent border-none px-2 py-1 font-mono text-slate-600 focus:outline-none focus:bg-white w-28 placeholder:text-slate-400 placeholder:font-normal disabled:opacity-50"
                                        value={roll.formedBatchNo || ""}
                                        onChange={(e) => {
                                          if (!roll.isCompleted) updateRollProp(lineId, roll.index, "formedBatchNo", e.target.value);
                                        }}
                                      />
                                    </span>
                                    <span className={cn("text-sm font-black flex flex-col items-end", roll.isCompleted ? "text-slate-500" : "text-blue-600")}>
                                      <span>{roll.isCompleted ? roll.actualLength?.toFixed(1) : roll.targetFormedLength.toFixed(1)} m</span>
                                      {!roll.isCompleted && (() => {
                                         const isFirst = roll.index === 0 && lineConfigs[lineId].fProduced > 0;
                                         const fProd = isFirst ? lineConfigs[lineId].fProduced : 0;
                                         const endMs = roll.endT ? roll.endT.getTime() : 0;
                                         const shiftEndMs = shiftEnd.getTime();
                                         const spillMins = (endMs - shiftEndMs) / 60000;
                                         const cConsum = isFirst ? Math.max(0, roll.targetFormedLength - fProd) : roll.targetFormedLength;
                                         const spillLength = Math.max(0, spillMins * config.speed);
                                         const nextShiftLength = Math.min(cConsum, spillLength);
                                         const thisShiftLength = cConsum - nextShiftLength;

                                         if (isFirst && nextShiftLength < 1) {
                                           return (
                                             <span className="text-[10px] font-medium text-slate-500 mt-0.5 font-sans">
                                               ({fProd.toFixed(1)}m 为接班已收, 本班产 {thisShiftLength.toFixed(1)}m)
                                             </span>
                                           );
                                         } else if (isFirst && nextShiftLength >= 1) {
                                           return (
                                              <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right flex flex-col items-end">
                                                <span>{fProd.toFixed(1)}m 为接班已收</span>
                                                <span>本班产 {thisShiftLength.toFixed(1)}m, 下班产 {nextShiftLength.toFixed(1)}m</span>
                                              </span>
                                           );
                                         } else if (!isFirst && nextShiftLength >= 1 && thisShiftLength >= 1) {
                                           return (
                                             <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right">
                                               (本班产 {thisShiftLength.toFixed(1)}m, 下班产 {nextShiftLength.toFixed(1)}m)
                                             </span>
                                           );
                                         } else if (!isFirst && nextShiftLength >= 1 && thisShiftLength < 1) {
                                           return (
                                             <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right">
                                               (全在下班产)
                                             </span>
                                           );
                                         }
                                         return null;
                                       })()}
                                     </span>
                                  </div>
                                  
                                  {roll.index === 0 && !roll.isCompleted && (
                                    <div className="flex bg-blue-50/50 rounded border border-blue-200/50 mt-3 p-1.5 items-center gap-2">
                                      <span className="text-[10px] text-blue-800 font-bold shrink-0">本卷生产完成?</span>
                                      <input
                                        type="number"
                                        className="w-16 text-xs p-1 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                        placeholder={roll.targetFormedLength.toFixed(1)}
                                        value={rollCompletionInputs[lineId] === undefined ? "" : rollCompletionInputs[lineId]}
                                        onChange={(e) => setRollCompletionInputs(p => ({ ...p, [lineId]: e.target.value }))}
                                      />
                                      <span className="text-xs text-blue-800/60 font-mono -ml-1">m</span>
                                      <input
                                        type="time"
                                        className="w-20 text-xs p-1 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono ml-1"
                                        value={rollCompletionTimeInputs[lineId] === undefined ? "" : rollCompletionTimeInputs[lineId]}
                                        onChange={(e) => setRollCompletionTimeInputs(p => ({ ...p, [lineId]: e.target.value }))}
                                      />
                                      <button
                                        onClick={() => handleCompleteRoll(lineId)}
                                        disabled={!rollCompletionInputs[lineId] || !rollCompletionTimeInputs[lineId]}
                                        className="ml-auto bg-blue-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed hover:bg-blue-500 active:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-all shadow-sm"
                                      >
                                        卸卷确认
                                      </button>
                                    </div>
                                  )}

                                  {roll.isJoint && roll.endT && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <div className="text-[10px] text-orange-600 font-bold px-2 py-1 bg-orange-50 border border-orange-200 rounded shadow-sm inline-block">
                                        含接头 (近 {format(roll.endT, "HH:mm")} 走出机器)
                                      </div>
                                    </div>
                                  )}
                               </div>
                             ))}
                           </div>
                         </div>
                       );
                    });
                  })()}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                  无分卷数据。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoilProgressBar({
  total,
  cPrev,
  cPrevUnrolled,
  cMineUnrolled,
  cMine,
  onChangePrev,
  onChangeMine,
}: {
  total: number;
  cPrev: number;
  cPrevUnrolled: number;
  cMineUnrolled: number;
  cMine: number;
  onChangePrev: (v: number) => void;
  onChangeMine: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<"prev" | "mine" | null>(
    null,
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!draggingHandle || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));
      const val = Math.round((x / rect.width) * total);

      if (draggingHandle === "prev") {
        onChangePrev(Math.min(val, cPrev + cMine));
      } else if (draggingHandle === "mine") {
        onChangeMine(Math.max(cMineUnrolled, val - cPrev));
      }
    };
    const handleUp = () => setDraggingHandle(null);

    if (draggingHandle) {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    }
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingHandle, total, cPrev, cMine, onChangePrev, onChangeMine]);

  const pctPrev = total > 0 ? (cPrev / total) * 100 : 0;
  const pctMineUnrolled = total > 0 ? (cMineUnrolled / total) * 100 : 0;
  const pctMineForming = total > 0 ? (Math.max(0, cMine - cMineUnrolled) / total) * 100 : 0;

  return (
    <div
      className="relative h-10 bg-slate-800 rounded-lg overflow-hidden border border-slate-700/60 mt-1 select-none"
      ref={barRef}
    >
      <div
        className="absolute inset-y-0 left-0 bg-blue-700/60 pointer-events-none"
        style={{ width: `${pctPrev}%` }}
      ></div>
      <div
        className="absolute inset-y-0 bg-emerald-500/60 pointer-events-none"
        style={{ left: `${pctPrev}%`, width: `${pctMineUnrolled}%` }}
      ></div>
      <div
        className="absolute inset-y-0 bg-blue-500/60 pointer-events-none"
        style={{ left: `${pctPrev + pctMineUnrolled}%`, width: `${pctMineForming}%` }}
      ></div>

      <div
        className="absolute inset-y-0 w-4 -ml-2 cursor-col-resize z-10 group flex justify-center touch-none"
        style={{ left: `${pctPrev}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDraggingHandle("prev");
        }}
      >
        <div className="w-1 h-full bg-blue-600 group-hover:bg-white" />
      </div>
      <div
        className="absolute inset-y-0 w-4 -ml-2 cursor-col-resize z-10 group flex justify-center touch-none"
        style={{ left: `${pctPrev + pctMineUnrolled + pctMineForming}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDraggingHandle("mine");
        }}
      >
        <div className="w-1 h-full bg-blue-400 group-hover:bg-white" />
      </div>

      <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none text-[10px] font-mono font-bold">
        <div className="flex gap-4">
          {cPrev > 0 && (
            <span className="text-blue-100 z-20 drop-shadow-md">
              上班已用: {cPrev}m {cPrevUnrolled > 0 && cPrevUnrolled !== cPrev ? `(已卸卷: ${cPrevUnrolled}m)` : ""}
            </span>
          )}
          {cMineUnrolled > 0 && (
            <span className="text-emerald-200 z-20 drop-shadow-md">
              本班已卸卷: {cMineUnrolled}m
            </span>
          )}
          {Math.max(0, cMine - cMineUnrolled) > 0 && (
            <span className="text-blue-200 z-20 drop-shadow-md">
              成卷中: {Math.max(0, cMine - cMineUnrolled)}m
            </span>
          )}
          {cPrev === 0 && cMine === 0 && (
            <span className="text-slate-400">尚未用</span>
          )}
        </div>
        <span className="text-slate-400 z-20">
          剩余: {Math.max(0, total - cPrev - cMine)}m
        </span>
      </div>
    </div>
  );
}

function FormedFoilProgressBar({
  target,
  fPrev,
  fMine,
  onChangePrev,
  onChangeMine,
}: {
  target: number;
  fPrev: number;
  fMine: number;
  onChangePrev: (v: number) => void;
  onChangeMine: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<"prev" | "mine" | null>(
    null,
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!draggingHandle || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));
      const val = Math.round((x / rect.width) * target);

      if (draggingHandle === "prev") {
        onChangePrev(Math.min(val, fPrev + fMine));
      } else if (draggingHandle === "mine") {
        onChangeMine(Math.max(0, val - fPrev));
      }
    };
    const handleUp = () => setDraggingHandle(null);

    if (draggingHandle) {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    }
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingHandle, target, fPrev, fMine, onChangePrev, onChangeMine]);

  const pctPrev = target > 0 ? (fPrev / target) * 100 : 0;
  const pctMine = target > 0 ? (fMine / target) * 100 : 0;

  return (
    <div
      className="relative h-10 bg-slate-800 rounded-lg overflow-hidden border border-slate-700/60 mt-1 select-none"
      ref={barRef}
    >
      <div
        className="absolute inset-y-0 left-0 bg-orange-600/40 pointer-events-none"
        style={{ width: `${pctPrev}%` }}
      ></div>
      <div
        className="absolute inset-y-0 bg-emerald-600/40 pointer-events-none"
        style={{ left: `${pctPrev}%`, width: `${pctMine}%` }}
      ></div>

      <div
        className="absolute inset-y-0 w-4 -ml-2 cursor-col-resize z-10 group flex justify-center touch-none"
        style={{ left: `${pctPrev}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDraggingHandle("prev");
        }}
      >
        <div className="w-1 h-full bg-orange-400 group-hover:bg-white" />
      </div>
      <div
        className="absolute inset-y-0 w-4 -ml-2 cursor-col-resize z-10 group flex justify-center touch-none"
        style={{ left: `${pctPrev + pctMine}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          // If click is roughly exactly where mine ends or we drag, set it
          setDraggingHandle("mine");
        }}
      >
        <div className="w-1 h-full bg-emerald-400 group-hover:bg-white" />
      </div>

      <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none text-[10px] font-mono font-bold">
        <div className="flex gap-4">
          {fPrev > 0 && (
            <span className="text-orange-200 z-20 drop-shadow-md">
              上班已收: {fPrev}m
            </span>
          )}
          {fMine > 0 && (
            <span className="text-emerald-200 z-20 drop-shadow-md">
              本班已收: {fMine}m
            </span>
          )}
          {fPrev === 0 && fMine === 0 && (
            <span className="text-slate-400">尚未收卷</span>
          )}
        </div>
        <span className="text-slate-400 z-20">
          目标剩余: {Math.max(0, target - fPrev - fMine)}m
        </span>
      </div>
    </div>
  );
}

function DraggableTimelineLine({
  lineId,
  config,
  cumSum,
  totalToForm,
  updateConfig,
  currentTime,
  shiftStart,
  minL,
  maxL,
  maxMinutes,
}: any) {
  const barRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editingRollIdx, setEditingRollIdx] = useState<number | null>(null);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const currMinutesFromStart = differenceInMinutes(currentTime, shiftStart);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggingIdx === null || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));

      // X corresponds to absolute minutes from shift start
      const cursorMinutesFromStart = (x / rect.width) * maxMinutes;

      // Convert time back to cumulative length
      const newCumulative =
        (cursorMinutesFromStart - currMinutesFromStart) * config.speed +
        config.fProduced;

      const prevH = draggingIdx === 0 ? 0 : cumSum[draggingIdx - 1];
      const nextH = cumSum[draggingIdx + 1];

      let leftMin = minL;
      if (draggingIdx === 0) leftMin = Math.max(minL, config.fProduced);

      let minAllowedPos = Math.max(prevH + leftMin, nextH - maxL);
      let maxAllowedPos = Math.min(prevH + maxL, nextH - minL);

      if (minAllowedPos > maxAllowedPos) {
        minAllowedPos = prevH + 50;
        maxAllowedPos = nextH - 50;
      }

      let clampedNewCum = Math.max(
        minAllowedPos,
        Math.min(maxAllowedPos, newCumulative),
      );

      const newRolls = [...config.rolls];
      newRolls[draggingIdx] = {
        ...newRolls[draggingIdx],
        targetFormedLength: clampedNewCum - prevH,
      };
      newRolls[draggingIdx + 1] = {
        ...newRolls[draggingIdx + 1],
        targetFormedLength: nextH - clampedNewCum,
      };

      updateConfig(lineId, { ...config, rolls: newRolls });
    };
    const handleUp = () => setDraggingIdx(null);

    if (draggingIdx !== null) {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    }
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    draggingIdx,
    config,
    totalToForm,
    lineId,
    cumSum,
    minL,
    maxL,
    maxMinutes,
    updateConfig,
    currMinutesFromStart,
  ]);

  return (
    <div
      ref={barRef}
      className="absolute inset-0 z-10 select-none rounded"
      style={{ touchAction: "pan-y" }}
      onClick={() => { setEditingRollIdx(null); setDeleteConfirmIdx(null); }}
    >
      {/* Render completed rolls first */}
      {config.completedRolls?.map((cr: any, i: number) => {
        const endTime = new Date(cr.unrollTime);
        const endMinutesFromStart = differenceInMinutes(endTime, shiftStart);
        const startMinutesFromStart = endMinutesFromStart - cr.length / config.speed;
        
        const pctLeft = (startMinutesFromStart / maxMinutes) * 100;
        const pctWidth = ((cr.length / config.speed) / maxMinutes) * 100;
        
        return (
          <div
            key={cr.id}
            className="absolute top-0 bottom-0 border-r border-white flex flex-col items-center justify-center group pointer-events-none"
            style={{
              left: `${Math.max(0, pctLeft)}%`,
              width: `${pctLeft < 0 ? pctWidth + pctLeft : pctWidth}%`,
              backgroundColor: `hsl(145, 70%, ${i % 2 === 0 ? "80%" : "75%"})`, // emerald color
            }}
          >
            {pctLeft + pctWidth > 0 && pctLeft < 100 && (
              <span className="text-[10px] font-black text-emerald-900/80 pointer-events-auto flex items-center gap-0.5">
                {cr.length.toFixed(1)}m <span className="opacity-70 text-[8px]">✓</span>
              </span>
            )}
          </div>
        );
      })}

      {config.rolls.map((roll: any, i: number) => {
        const prevLength = i === 0 ? 0 : cumSum[i - 1];
        const currLength = prevLength + roll.targetFormedLength;

        const startTimeFromNow = (prevLength - config.fProduced) / config.speed;
        const endTimeFromNow = (currLength - config.fProduced) / config.speed;

        const startMinutesFromShiftStart =
          currMinutesFromStart + startTimeFromNow;
        const endMinutesFromShiftStart = currMinutesFromStart + endTimeFromNow;

        const pctLeft = (startMinutesFromShiftStart / maxMinutes) * 100;
        const pctWidth =
          ((endMinutesFromShiftStart - startMinutesFromShiftStart) /
            maxMinutes) *
          100;

        const duration = endMinutesFromShiftStart - startMinutesFromShiftStart;
        let visibleCenterPct = 50;
        let visibleWidthPct = pctWidth;
        if (duration > 0) {
          const visibleStartMins = Math.max(0, startMinutesFromShiftStart);
          const visibleEndMins = Math.max(0, Math.min(maxMinutes, endMinutesFromShiftStart));
          visibleWidthPct = ((visibleEndMins - visibleStartMins) / maxMinutes) * 100;
          const visibleMinsCenter = (visibleStartMins + visibleEndMins) / 2;
          visibleCenterPct =
            ((visibleMinsCenter - startMinutesFromShiftStart) / duration) * 100;
        }

        const isPoppedOut = visibleWidthPct < 20;

        return (
          <div
            key={roll.id}
            className={cn(
              "absolute top-0 bottom-0 border-r border-white group pointer-events-none",
              roll.isJoint && "z-20",
            )}
            style={{
              left: `${pctLeft}%`,
              width: `${pctWidth}%`,
              backgroundColor: roll.isJoint
                ? `hsl(28, 90%, ${i % 2 === 0 ? "85%" : "80%"})` // orange color 
                : `hsl(215, 80%, ${i % 2 === 0 ? "90%" : "85%"})`, 
            }}
          >
            {/* Joint Marker at the end of the roll */}
            {roll.isJoint && pctLeft + pctWidth <= 100 && (
              <div className="absolute right-0 top-full mt-2 pointer-events-none flex flex-col items-center select-none" style={{ transform: "translateX(50%)" }}>
                <div className="w-px h-2 bg-orange-400"></div>
                <div className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                  末端接头必分卷
                </div>
              </div>
            )}
            
            {pctLeft + pctWidth > 0 && pctLeft < 100 && (
              <div 
                className={cn(
                  "absolute flex flex-col items-center pointer-events-auto cursor-pointer active:opacity-60 hover:opacity-80 transition-opacity",
                  isPoppedOut ? (roll.isJoint ? "bottom-full mb-2 z-40 overflow-visible whitespace-nowrap bg-orange-50 px-2 py-1 rounded-md shadow-md border border-orange-400" : "bottom-full mb-2 z-40 overflow-visible whitespace-nowrap bg-blue-50 px-2 py-1 rounded-md shadow-md border border-blue-400") : "top-0 bottom-0 justify-center px-1 whitespace-nowrap",
                  editingRollIdx !== i && !isPoppedOut && "overflow-hidden",
                  editingRollIdx === i && "z-50 overflow-visible"
                )}
                style={{
                  left: `${visibleCenterPct}%`,
                  transform: 'translateX(-50%)',
                  touchAction: "pan-y"
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingRollIdx(i);
                  setDeleteConfirmIdx(null);
                  setEditValue(roll.targetFormedLength.toFixed(1));
                }}
              >
                {editingRollIdx === i ? (
                  <div className="relative flex items-center gap-1 bg-white p-0.5 rounded shadow border border-slate-200" onClick={e => e.stopPropagation()}>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const el = document.activeElement as HTMLElement;
                      if (el) el.blur();
                    }} className="flex items-center">
                      <input 
                        autoFocus
                        type="number"
                        step="0.1"
                        className="w-14 pl-1 py-1 text-xs font-bold text-blue-900 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                        style={{ appearance: 'none', WebkitAppearance: 'none' }}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          let val = parseFloat(editValue);
                          if (!isNaN(val) && val !== roll.targetFormedLength) {
                            let leftMin = minL;
                            if (i === 0) leftMin = Math.max(minL, config.fProduced);
                            
                            let sum = 0;
                            let otherTarget = 0;
                            let canBorrow = false;
                            let borrowIdx = -1;
                            
                            if (i < config.rolls.length - 1) {
                              borrowIdx = i + 1;
                              otherTarget = config.rolls[i+1].targetFormedLength;
                              sum = roll.targetFormedLength + otherTarget;
                              canBorrow = true;
                            } else if (i > 0) {
                              borrowIdx = i - 1;
                              otherTarget = config.rolls[i-1].targetFormedLength;
                              sum = roll.targetFormedLength + otherTarget;
                              leftMin = minL;
                              canBorrow = true;
                            }
                            
                            if (canBorrow) {
                               const borrowMin = borrowIdx === 0 ? Math.max(minL, config.fProduced) : minL;
                               const maxAllowed = Math.min(maxL, sum - borrowMin);
                               const minAllowed = Math.max(leftMin, sum - maxL);
                               
                               if (minAllowed <= maxAllowed) {
                                  val = Math.max(minAllowed, Math.min(maxAllowed, val));
                               } else {
                                  val = Math.max(leftMin, Math.min(maxL, val));
                               }
                               
                               const delta = val - roll.targetFormedLength;
                               const newRolls = [...config.rolls];
                               newRolls[i] = { ...newRolls[i], targetFormedLength: val };
                               newRolls[borrowIdx] = { ...newRolls[borrowIdx], targetFormedLength: newRolls[borrowIdx].targetFormedLength - delta };
                               updateConfig(lineId, { ...config, rolls: newRolls });
                            } else {
                               val = Math.max(leftMin, Math.min(maxL, val));
                               const newRolls = [...config.rolls];
                               newRolls[i] = { ...newRolls[i], targetFormedLength: val };
                               updateConfig(lineId, { ...config, rolls: newRolls });
                            }
                          }
                          // Note: we can't clear setEditingRollIdx(null) onBlur because it blocks click events on the Plus/Trash icons.
                          // Instead, let's use a timeout or let the click handler in the background close it.
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setEditingRollIdx(null); setDeleteConfirmIdx(null); }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.target as HTMLElement).blur();
                            setEditingRollIdx(null);
                            setDeleteConfirmIdx(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>

                    {/* Toolbar popup below the progress bar */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-8 bg-slate-900 border border-slate-700 shadow-xl rounded-lg p-1 flex items-center gap-1 z-50">
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-t border-l border-slate-700 rotate-45"></div>
                      <button 
                        type="button"
                        className="p-1.5 hover:bg-slate-800 rounded text-emerald-400 flex items-center gap-1 pr-2 z-10 block"
                        onPointerDown={(e) => { e.stopPropagation(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newRolls = [...config.rolls];
                          const half = newRolls[i].targetFormedLength / 2;
                          newRolls[i].targetFormedLength = half;
                          newRolls.splice(i + 1, 0, {
                            id: Math.random().toString(),
                            targetFormedLength: half,
                            isJoint: false,
                            batchNumber: newRolls[i].batchNumber
                          });
                          updateConfig(lineId, { ...config, rolls: newRolls });
                          setEditingRollIdx(null);
                        }}
                      >
                        <Plus size={14} strokeWidth={3} />
                        <span className="text-[10px] font-bold">加卷</span>
                      </button>

                      {config.rolls.length > 1 && (
                        <div className="w-px h-4 bg-slate-700 z-10"></div>
                      )}

                      {(config.rolls.length > 1) && (
                        deleteConfirmIdx === i ? (
                          <div className="flex items-center gap-1 pr-1 pl-1">
                            <button
                                type="button"
                                className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-[10px] font-bold z-10"
                                onPointerDown={(e) => { e.stopPropagation(); }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newRolls = [...config.rolls];
                                  if (i === newRolls.length - 1 && i > 0) {
                                    newRolls[i-1].targetFormedLength += newRolls[i].targetFormedLength;
                                    newRolls[i-1].isJoint = newRolls[i].isJoint;
                                    newRolls[i-1].batchNumber = newRolls[i].batchNumber;
                                    newRolls.splice(i, 1);
                                  } else if (i < newRolls.length - 1) {
                                    newRolls[i].targetFormedLength += newRolls[i+1].targetFormedLength;
                                    newRolls[i].isJoint = newRolls[i+1].isJoint;
                                    newRolls[i].batchNumber = newRolls[i+1].batchNumber;
                                    newRolls.splice(i+1, 1);
                                  }
                                  updateConfig(lineId, { ...config, rolls: newRolls });
                                  setEditingRollIdx(null);
                                  setDeleteConfirmIdx(null);
                                }}
                            >确认删除</button>
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold z-10"
                                onPointerDown={(e) => { e.stopPropagation(); }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmIdx(null);
                                }}
                            >取消</button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            className="p-1.5 hover:bg-slate-800 rounded text-red-400 flex items-center gap-1 pr-2 z-10 block"
                            onPointerDown={(e) => { e.stopPropagation(); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmIdx(i);
                            }}
                          >
                            <Trash2 size={14} />
                            <span className="text-[10px] font-bold">删除</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {isPoppedOut && (
                      <div className={cn("absolute top-full left-1/2 -translate-x-1/2 w-px h-2.5", roll.isJoint ? "bg-orange-400" : "bg-blue-400")}>
                        <div className={cn("absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-1.5 h-1.5 rotate-45 border-b border-r", roll.isJoint ? "border-orange-400" : "border-blue-400")}></div>
                      </div>
                    )}
                    <span className={cn("font-black truncate", isPoppedOut ? "text-xs" : "text-[10px]", roll.isJoint ? "text-orange-900/80" : "text-blue-900/80")}>
                      {roll.targetFormedLength.toFixed(1)}m
                    </span>
                    
                    {(() => {
                      if (startMinutesFromShiftStart > maxMinutes) {
                        return (
                          <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 leading-none mt-0.5 truncate">
                            (全在下班产)
                          </span>
                        );
                      }
                      
                      let inShift = roll.targetFormedLength;
                      if (i === 0) inShift -= config.fProduced; // Subtract what's already produced
                      
                      if (endMinutesFromShiftStart > maxMinutes) {
                         const spillMins = endMinutesFromShiftStart - maxMinutes;
                         const spillLength = spillMins * config.speed;
                         inShift = Math.max(0, inShift - spillLength);
                         
                         return (
                            <span className="text-[8px] sm:text-[9px] font-bold text-amber-700/80 leading-none mt-0.5 truncate">
                              (下班产 {spillLength.toFixed(1)}m)
                            </span>
                         );
                      }
                      
                      if (i === 0 && config.fProduced > 0) {
                         return (
                          <span className="text-[8px] sm:text-[9px] font-bold text-blue-800/60 leading-none mt-0.5 truncate">
                            (本班新产 {inShift.toFixed(1)}m)
                          </span>
                         );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {cumSum.slice(0, -1).map((h: number, i: number) => {
        const minutesElapsed = (h - config.fProduced) / config.speed;
        const minutesFromShiftStart = currMinutesFromStart + minutesElapsed;
        const leftPct = (minutesFromShiftStart / maxMinutes) * 100;
        const nodeTime = addMinutes(currentTime, minutesElapsed);

        return (
          <div
            key={"handle-" + i}
            className="absolute top-0 bottom-0 w-8 -ml-4 cursor-col-resize flex justify-center items-center z-20 hover:bg-black/5 active:bg-black/10 transition-colors touch-none"
            style={{ left: `${leftPct}%` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDraggingIdx(i);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDraggingIdx(null);
            }}
          >
            <div
              className={cn(
                "w-1.5 h-8 rounded-full shadow-md transition-colors",
                draggingIdx === i
                  ? "bg-blue-600"
                  : "bg-white border border-slate-300",
              )}
            />
            <div className="absolute top-[110%] w-max bg-slate-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              {format(nodeTime, "HH:mm")}
            </div>
            <div className="absolute top-[14px] bg-blue-50/90 text-blue-800 text-[9px] font-bold px-1 rounded pointer-events-none">
              {format(nodeTime, "HH:mm")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [timeOffset, setTimeOffset] = useState(0);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSimulator, setShowSimulator] = useState(false);
  const [simDateStr, setSimDateStr] = useState("");
  const [simTimeStr, setSimTimeStr] = useState("");

  const [activePage, setActivePage] = useState<"dashboard" | "plan" | "admin" | "settings">("dashboard");

  // -- Shift info --
  const shiftInfo = getShiftInfo(currentTime);

  // If the user opens this on a rest day, provide a way to simulate a workday for the timeline
  const viewDate =
    shiftInfo.type === "Rest" ? ANCHOR_DATE_DAY1_YI : startOfDay(currentTime);

  const viewShiftInfo = getShiftInfo(viewDate);

  // -- punch state --
  const [punchRecords, setPunchRecords] = useState<
    Record<string, { in: boolean; out: boolean }>
  >({});

  const { user, signIn, logOut } = useAuth();
  
  const dateKey = format(currentTime, "yyyy-MM-dd");



  const handlePunch = (shiftId: string, action: "in" | "out") => {
    setPunchRecords((prev) => ({
      ...prev,
      [shiftId]: {
        ...(prev[shiftId] || { in: false, out: false }),
        [action]: true,
      },
    }));
  };

  const activeShifts = getRelevantShifts(currentTime).sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  let punchAlert: {
    action: "in" | "out";
    shift: any;
    style: "info" | "warning";
    msg: string;
  } | null = null;

  const nowMs = currentTime.getTime();
  const fiveMinMs = 5 * 60 * 1000;
  const hoursToMs = (h: number) => h * 60 * 60 * 1000;

  for (const shift of activeShifts) {
    const record = punchRecords[shift.id] || { in: false, out: false };
    const msSinceStart = nowMs - shift.start.getTime();
    const msSinceEnd = nowMs - shift.end.getTime();

    if (record.in && !record.out) {
      if (msSinceEnd >= 0 && msSinceEnd <= fiveMinMs) {
        punchAlert = {
          action: "out",
          shift,
          style: "info",
          msg: `${shift.name} 规定下班时间已过，请确认下班打卡。`,
        };
        break;
      } else if (msSinceEnd > fiveMinMs && msSinceEnd < hoursToMs(12)) {
        punchAlert = {
          action: "out",
          shift,
          style: "warning",
          msg: `您似乎忘记了 ${shift.name} 的下班打卡！请尽快确认打卡！`,
        };
        break;
      }
    }

    if (!record.in) {
      if (msSinceStart >= -fiveMinMs && msSinceStart < 0) {
        punchAlert = {
          action: "in",
          shift,
          style: "info",
          msg: `距离 ${shift.name} 规定上班时间还有不到 ${Math.ceil(-msSinceStart / 60000)} 分钟，请准备打卡。`,
        };
        break;
      } else if (msSinceStart >= 0 && msSinceStart < hoursToMs(12)) {
        punchAlert = {
          action: "in",
          shift,
          style: "warning",
          msg: `您已进入 ${shift.name} 的工作时间但系统未收到打卡记录，请尽快打卡！`,
        };
        break;
      }
    }
  }

  // -- active tasks state --
  const [activeSplicing, setActiveSplicing] = useState<SplicingTask[]>([]);
  const [lastWashes, setLastWashes] = useState<Record<LineId, Date | null>>({
    "24": null,
    "25": null,
    "26": null,
  });

  // -- line config states --
  const [lineConfigs, setLineConfigs] = useState<
    Record<LineId, LinePlanConfig>
  >({
    "24": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.35, futureRolls: [], rolls: [], completedRolls: [] },
    "25": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.30, futureRolls: [], rolls: [], completedRolls: [] },
    "26": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.38, futureRolls: [], rolls: [], completedRolls: [] }
  });

  // -- form states --
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "plan" | "forecast" | "splicing" | "wash" | "unroll" | "observe"
  >("plan");
  const [selectedLine, setSelectedLine] = useState<LineId>("24");

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
  const [addFoilDialog, setAddFoilDialog] = useState<boolean>(false);
  const [addFoilBatch, setAddFoilBatch] = useState<string>("");
  const [addFoilLength, setAddFoilLength] = useState<string>("");
  const [cutFoilDialog, setCutFoilDialog] = useState<boolean>(false);
  const [cutFoilLength, setCutFoilLength] = useState<string>("");
  const [forecastBatch, setForecastBatch] = useState("");
  const [forecastLength, setForecastLength] = useState("");
  const [showCompletedRolls, setShowCompletedRolls] = useState(false);
  const [rollCompletionInputs, setRollCompletionInputs] = useState<Record<LineId, string>>({
    "24": "",
    "25": "",
    "26": "",
  });
  const [rollCompletionTimeInputs, setRollCompletionTimeInputs] = useState<Record<LineId, string>>({
    "24": "",
    "25": "",
    "26": "",
  });
  const [mealConfig, setMealConfig] = useState<MealConfig>({
    lunchStart: 11 + 35 / 60,
    lunchEnd: 12 + 15 / 60,
    dinnerStart: 17 + 10 / 60,
    dinnerEnd: 17 + 50 / 60,
  });

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/punchRecords/${dateKey}`;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'punchRecords', dateKey), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const data = docSnap.data();
          if (data.records) {
             setPunchRecords(JSON.parse(data.records));
          }
        } catch (e) {
             handleFirestoreError(e, OperationType.GET, path);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, [user, dateKey]);

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/lineStates/${dateKey}`;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'lineStates', dateKey), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const data = docSnap.data();
          if (data.lineConfigs) setLineConfigs(JSON.parse(data.lineConfigs));
          if (data.activeSplicing) setActiveSplicing(JSON.parse(data.activeSplicing));
          if (data.lastWashes) setLastWashes(JSON.parse(data.lastWashes));
        } catch(e) {
          handleFirestoreError(e, OperationType.GET, path);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, [user, dateKey]);

  // debounce writes to firestore for lineState
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
       firstRenderRef.current = false;
       return;
    }
    if (!user) return;
    const saveState = async () => {
      const path = `users/${user.uid}/lineStates/${dateKey}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'lineStates', dateKey), {
          userId: user.uid,
          dateKey,
          lineConfigs: JSON.stringify(lineConfigs),
          activeSplicing: JSON.stringify(activeSplicing),
          lastWashes: JSON.stringify(lastWashes),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);
  }, [lineConfigs, activeSplicing, lastWashes, user, dateKey]);

  // debounce writes to firestore for punchRecords
  useEffect(() => {
    if (!user) return;
    // Don't save on initial empty state if we haven't loaded yet
    if (Object.keys(punchRecords).length === 0) return;
    
    const savePunch = async () => {
      const path = `users/${user.uid}/punchRecords/${dateKey}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'punchRecords', dateKey), {
          userId: user.uid,
          dateKey,
          records: JSON.stringify(punchRecords),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(savePunch, 500);
    return () => clearTimeout(timer);
  }, [punchRecords, user, dateKey]);

  const handleCompleteRoll = (lineId: LineId) => {
    const c = lineConfigs[lineId];
    if (c.rolls.length === 0) return;

    const currentRoll = c.rolls[0];

    const actualLStr = rollCompletionInputs[lineId];
    const timeStr = rollCompletionTimeInputs[lineId];
    if (!actualLStr || !timeStr) return;

    const actualL = parseFloat(actualLStr);
    if (isNaN(actualL) || actualL <= 0) return;

    const [hours, minutes] = timeStr.split(":").map(Number);
    const unrollDate = new Date(currentTime);
    unrollDate.setHours(hours, minutes, 0, 0);

    if (unrollDate > currentTime) {
      // Must be yesterday
      unrollDate.setDate(unrollDate.getDate() - 1);
    }

    const diff = actualL - currentRoll.targetFormedLength;

    const newRolls = [...c.rolls];
    newRolls.shift(); // remove completed roll

    if (newRolls.length > 0) {
      newRolls[0] = {
        ...newRolls[0],
        targetFormedLength: Math.max(10, newRolls[0].targetFormedLength - diff),
      };
    }

    const completed = [...(c.completedRolls || [])];
    completed.push({
      id: currentRoll.id,
      batchNo: currentRoll.formedBatchNo || "",
      corrosionBatchNo: currentRoll.batchNumber || "",
      length: actualL,
      unrollTime: unrollDate.toISOString(),
    });

    const newMineUnrolled = completed.reduce((sum, cr) => sum + cr.length, 0);

    const minsSinceUnroll = Math.max(0, differenceInMinutes(currentTime, unrollDate));
    const newFProduced = minsSinceUnroll * c.speed;

    setLineConfigs((p) => ({
      ...p,
      [lineId]: {
        ...c,
        rolls: newRolls,
        cUsed: Math.max(c.cUsed, (c.cPrevUsed || 0) + newMineUnrolled),
        fProduced: newFProduced,
        fPrevProduced: 0,
        completedRolls: completed,
      },
    }));

    setRollCompletionInputs((prev) => ({ ...prev, [lineId]: "" }));
    setRollCompletionTimeInputs((prev) => ({ ...prev, [lineId]: "" }));
  };

  const handleAddFutureRoll = () => {
    if (!forecastBatch || !forecastLength) return;
    const lineConf = lineConfigs[selectedLine];
    const frs = lineConf.futureRolls || [];
    const newConfigs = {
      ...lineConfigs,
      [selectedLine]: {
        ...lineConf,
        futureRolls: [
          ...frs,
          {
            id: Math.random().toString(),
            batchNo: forecastBatch,
            length: Number(forecastLength),
          },
        ],
      },
    };
    handleGeneratePlan(selectedLine, newConfigs);
    setForecastBatch("");
    setForecastLength("");
  };

  const handleRemoveFutureRoll = (id: string) => {
    const p = lineConfigs;
    const newConfigs = {
      ...p,
      [selectedLine]: {
        ...p[selectedLine],
        futureRolls: p[selectedLine].futureRolls!.filter(
          (x) => x.id !== id
        ),
      },
    };
    handleGeneratePlan(selectedLine, newConfigs);
  };

  const handleSavePlan = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Form - Unroll
  const [unloadLength, setUnloadLength] = useState("");

  // Form - Observe
  const [observeStage, setObserveStage] = useState(STAGES[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      const baseTime = new Date(Date.now() + timeOffset);
      if (isPlanningMode) {
        setCurrentTime(getPlanningShiftStart(baseTime));
      } else {
        setCurrentTime(baseTime);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffset, isPlanningMode]);

  const handleTogglePlanningMode = () => {
    setIsPlanningMode((prev) => {
      const next = !prev;
      const baseTime = new Date(Date.now() + timeOffset);
      if (next) {
        setCurrentTime(getPlanningShiftStart(baseTime));
      } else {
        setCurrentTime(baseTime);
      }
      return next;
    });
  };

  const handleOpenSimulator = () => {
    setSimDateStr(format(currentTime, "yyyy-MM-dd"));
    setSimTimeStr(format(currentTime, "HH:mm"));
    setShowSimulator(!showSimulator);
  };

  const applySimulation = () => {
    const [year, month, day] = simDateStr.split("-").map(Number);
    const [hour, min] = simTimeStr.split(":").map(Number);
    const targetDate = new Date(year, month - 1, day, hour, min, 0);
    const offset = targetDate.getTime() - Date.now();
    setTimeOffset(offset);
    if (isPlanningMode) {
      setCurrentTime(getPlanningShiftStart(new Date(Date.now() + offset)));
    } else {
      setCurrentTime(new Date(Date.now() + offset));
    }
    setShowSimulator(false);
  };

  const resetSimulation = () => {
    setTimeOffset(0);
    if (isPlanningMode) {
      setCurrentTime(getPlanningShiftStart(new Date()));
    } else {
      setCurrentTime(new Date());
    }
    setShowSimulator(false);
  };

  const handleStartSplicing = () => {
    setActiveSplicing((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        line: selectedLine,
        startTime: currentTime,
        status: "splicing",
      },
    ]);
  };

  const handleRecordWash = () => {
    setLastWashes((prev) => ({ ...prev, [selectedLine]: currentTime }));
  };

  // derived state for Splicing Tasks
  const updatedSplicingTasks = activeSplicing.map((task) => {
    const minElapsed = differenceInMinutes(currentTime, task.startTime);
    // Logic: 30m splice -> wait 15m - 20m -> 10m pass rack
    let displayStatus = "接箔中";
    let urgency = "normal";
    let progress = 0;

    if (minElapsed < 30) {
      displayStatus = `接箔作业 (${30 - minElapsed}m 剩余)`;
      progress = (minElapsed / 30) * 100;
    } else if (minElapsed < 45) {
      displayStatus = `准备过架 (${45 - minElapsed}m 后需过架)`;
      urgency = "warning";
      progress = 100;
    } else if (minElapsed < 55) {
      displayStatus = `过架子作业 (${55 - minElapsed}m 剩余)`;
      urgency = "critical";
      progress = 100;
    } else {
      displayStatus = "作业结束";
      progress = 100;
    }
    return { ...task, minElapsed, displayStatus, urgency, progress };
  });

  const handleGeneratePlan = (
    lineId: LineId,
    currentLineConfigs = lineConfigs,
  ) => {
    const conf = currentLineConfigs[lineId];
    let L = conf.cTotal - conf.cUsed;
    if (L <= 0 && (!conf.futureRolls || conf.futureRolls.length === 0)) return currentLineConfigs;
    const avg = lineId === "25" ? 550 : 475;
    const minL = lineId === "25" ? 300 : 400;
    const maxL = lineId === "25" ? 800 : 550;

    const shiftEnd = getCurrentShiftEnd(currentTime);

    // Collect planned times from OTHER lines to encourage bundling
    const otherRollTimes: number[] = [];
    LINES.forEach((l) => {
      if (l !== lineId) {
        let accC = 0;
        currentLineConfigs[l].rolls.forEach((r, i) => {
          const cConsum =
            i === 0
              ? Math.max(
                  0,
                  r.targetFormedLength - currentLineConfigs[l].fProduced,
                )
              : r.targetFormedLength;
          accC += cConsum;
          const endT = new Date(
            currentTime.getTime() +
              (accC / currentLineConfigs[l].speed) * 60000,
          );
          otherRollTimes.push(endT.getTime());
        });
      }
    });

    let allNewRolls: PlannedRoll[] = [];
    let globalAccC = 0;

    const generateForFoil = (
      foilLength: number,
      fProducedOffset: number,
      foilBatchNo: string,
    ) => {
      let totalToForm = fProducedOffset + foilLength;

      const evaluate = (targets: number[]) => {
        let p = 0;
        let accForFoil = 0;
        for (let i = 0; i < targets.length; i++) {
          const tL = targets[i];
          // check format constraints
          if (tL < minL) p += (minL - tL) * 200;
          if (tL > maxL) p += (tL - maxL) * 200;
          p += Math.abs(tL - avg);

          let cConsum = i === 0 ? tL - fProducedOffset : tL;
          if (i === targets.length - 1) cConsum = foilLength - accForFoil;
          if (cConsum < 0) cConsum = 0;
          accForFoil += cConsum;

          const endTime = new Date(
            currentTime.getTime() +
              ((globalAccC + accForFoil) / conf.speed) * 60000,
          );
          const endMs = endTime.getTime();
          const shiftEndMs = shiftEnd.getTime();

          if (checkMealConflict(endTime, mealConfig)) p += 10000;

          // Penalty for unroll within 60 mins before shift end
          if (endMs > shiftEndMs - 60 * 60000 && endMs < shiftEndMs) p += 5000;
          // Penalty for unroll within 30 mins after shift start
          if (endMs > shiftEndMs && endMs < shiftEndMs + 30 * 60000) p += 3000;

          // Bundling with other lines
          for (const ot of otherRollTimes) {
            const diffMins = Math.abs(endMs - ot) / 60000;
            if (diffMins > 15 && diffMins <= 45) {
              p += (45 - diffMins) * 20; // Try to avoid medium gaps (awkward resting)
            } else if (diffMins <= 15) {
              p -= 500; // Reward for bundling close together
            }
          }
        }
        return p;
      };

      let bestTargets: number[] = [];
      let minPenalty = Infinity;

      let nMin = Math.max(1, Math.ceil(totalToForm / maxL));
      let nMax = Math.max(nMin, Math.floor(totalToForm / minL));

      for (let n = nMin; n <= nMax; n++) {
        let t1 = totalToForm / n;
        if (n === 1) t1 = totalToForm;
        if (t1 < fProducedOffset) t1 = fProducedOffset;
        let targets = [t1];
        let remain = totalToForm - t1;
        if (n > 1) {
          let avgRest = remain / (n - 1);
          for (let i = 1; i < n; i++) targets.push(avgRest);
        }
        let p = evaluate(targets);
        if (p < minPenalty) {
          minPenalty = p;
          bestTargets = targets;
        }
      }

      for (let iter = 0; iter < 10000; iter++) {
        let n = nMin + Math.floor(Math.random() * (nMax - nMin + 1));
        let remain = totalToForm;
        let targets: number[] = [];
        let valid = true;
        for (let i = 0; i < n - 1; i++) {
          let minTake = Math.max(minL, remain - (n - 1 - i) * maxL);
          let maxTake = Math.min(maxL, remain - (n - 1 - i) * minL);
          if (i === 0) minTake = Math.max(minTake, fProducedOffset);

          if (minTake > maxTake) {
            minTake = minL;
            maxTake = maxL;
          }
          if (minTake > maxTake) {
            valid = false;
            break;
          }
          let take = minTake + Math.random() * (maxTake - minTake);
          targets.push(take);
          remain -= take;
        }
        if (!valid) continue;
        targets.push(remain);

        const p = evaluate(targets);
        if (p < minPenalty) {
          minPenalty = p;
          bestTargets = targets;
        }
      }

      if (bestTargets.length === 0) bestTargets = [totalToForm];

      let foilAccumulatedC = 0;

      for (let i = 0; i < bestTargets.length; i++) {
        let targetL = bestTargets[i];
        let cConsum = i === 0 ? targetL - fProducedOffset : targetL;
        targetL = Number(targetL.toFixed(1));

        if (i === bestTargets.length - 1) {
          cConsum = Number((foilLength - foilAccumulatedC).toFixed(1));
          targetL = Number(
            (i === 0 ? fProducedOffset + cConsum : cConsum).toFixed(1),
          );
        }
        foilAccumulatedC += cConsum;

        allNewRolls.push({
          id: Math.random().toString(),
          targetFormedLength: targetL,
          isJoint: i === bestTargets.length - 1,
          batchNumber: foilBatchNo || "",
        });
      }
      globalAccC += foilAccumulatedC;
    };

    // 1. Current foil logic
    if (L > 0) {
      generateForFoil(L, conf.fProduced, conf.batchNo || "");
    }

    // 2. Future queued foils
    if (conf.futureRolls) {
      conf.futureRolls.forEach((fr) => {
        generateForFoil(fr.length, 0, fr.batchNo);
      });
    }

    const nextConfigs = {
      ...currentLineConfigs,
      [lineId]: { ...conf, rolls: allNewRolls },
    };
    setLineConfigs(nextConfigs);
    return nextConfigs;
  };

  const handleGlobalGeneratePlan = () => {
    // Sequentially plan each line so they can bundle with previous ones
    let currentConfigs = { ...lineConfigs };
    LINES.forEach((lineId) => {
      currentConfigs =
        handleGeneratePlan(lineId, currentConfigs) || currentConfigs;
    });
  };

  const getComputedPlanForLine = (lineId: LineId) => {
    const config = lineConfigs[lineId];
    let accC = 0;
    return config.rolls.map((roll, i) => {
      const startT =
        i === 0 ? currentTime : addMinutes(currentTime, accC / config.speed);
      const cConsum =
        i === 0
          ? Math.max(0, roll.targetFormedLength - config.fProduced)
          : roll.targetFormedLength;
      accC += cConsum;
      const endT = addMinutes(currentTime, accC / config.speed);
      const meal = checkMealConflict(endT, mealConfig);
      const isWarning =
        (lineId === "25" &&
          (roll.targetFormedLength < 300 || roll.targetFormedLength > 800)) ||
        (lineId !== "25" &&
          (roll.targetFormedLength < 400 || roll.targetFormedLength > 550));
      return {
        ...roll,
        corrosionConsumed: cConsum,
        startTime: startT,
        endTime: endT,
        meal,
        isWarning,
      };
    });
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/80 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-56 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 transition-transform duration-300 ease-in-out h-full lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 relative">
          <div className="flex items-center gap-3 mb-8">

            {user ? (
               <button onClick={logOut} className="mr-2 text-xs text-blue-200">登出 ({user.email})</button>
            ) : (
               <button onClick={signIn} className="mr-2 text-xs text-white bg-blue-600 px-2 py-1 rounded">登录以保存数据</button>
            )}
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-500/20">
              F
            </div>
            <h1 className="text-base font-bold text-white tracking-wide">
              智能箔材系统
            </h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden absolute top-6 right-4 text-slate-400 hover:text-white">
            <X size={20} />
          </button>
          <nav className="space-y-1.5">
            <button
              onClick={() => { setActivePage("dashboard"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "dashboard"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <LayoutDashboard size={16} /> 工作台指引
            </button>
            <button
              onClick={() => { setActivePage("admin"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "admin"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Database size={16} /> 数据后台
            </button>
            <button
              onClick={() => { setActivePage("plan"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "plan"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <ListTodo size={16} /> 分卷计划
            </button>
            <button
              onClick={() => { setActivePage("settings"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "settings"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Settings2 size={16} /> 设置
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-[13px] font-semibold transition-all">
              <Activity size={16} /> 接头动态追踪
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-[13px] font-semibold transition-all">
              <Droplets size={16} /> 结晶冲洗记录
            </button>
          </nav>
        </div>
        <div className="mt-auto p-5 mx-3 mb-4 rounded-xl bg-slate-800 border border-slate-700/50 shadow-inner">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
              乙
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-200">
                乙班 (Yi Shift)
              </p>
              <p
                className={cn(
                  "text-[10px] uppercase font-bold tracking-wider mt-0.5",
                  shiftInfo.type === "Day"
                    ? "text-blue-400"
                    : shiftInfo.type === "Night"
                      ? "text-indigo-400"
                      : "text-emerald-400",
                )}
              >
                {shiftInfo.name}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden max-w-[1600px] w-full relative">
        {activePage === "dashboard" ? (
          <div className="flex flex-col h-full overflow-hidden w-full relative">
            {/* Punch Banner */}
            {punchAlert && (
              <div
                className={cn(
                  "shrink-0 mb-6 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in slide-in-from-top-2 z-10 border",
                  punchAlert.style === "warning"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-blue-50 border-blue-200 text-blue-800",
                )}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle
                    size={20}
                    className={
                      punchAlert.style === "warning"
                        ? "text-red-500"
                        : "text-blue-500"
                    }
                  />
                  <span className="font-bold text-sm tracking-wide">
                    {punchAlert.msg}
                  </span>
                </div>
                <button
                  onClick={() =>
                    handlePunch(punchAlert!.shift.id, punchAlert!.action)
                  }
                  className={cn(
                    "w-full sm:w-auto px-6 py-2.5 font-black rounded-lg text-[13px] transition-all active:scale-95 shadow border",
                    punchAlert.style === "warning"
                      ? "bg-red-600 hover:bg-red-500 border-red-700 text-white shadow-red-600/30"
                      : "bg-blue-600 hover:bg-blue-500 border-blue-700 text-white shadow-blue-600/30",
                  )}
                >
                  {punchAlert.action === "in"
                    ? "马上点击【上班打卡】"
                    : "马上点击【下班打卡】"}
                </button>
              </div>
            )}

            {/* Header Bar */}
            <header className="flex flex-wrap items-center justify-between mb-6 md:mb-8 shrink-0 gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Menu size={24} />
                </button>
                <div>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                    执行看版
                  </h2>
                </div>
              </div>
            </header>

            <div className="flex flex-col lg:max-w-4xl mx-auto w-full gap-6 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden pb-20 md:pb-0">
              {/* Timeline Context (Left Column) */}
              <div className="w-full max-w-full flex flex-col gap-6 xl:overflow-y-auto pr-2 pb-4 hide-scrollbar">
                {/* 12 Hour Shift Timeline */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 shrink-0">
                  <div className="p-4 flex flex-col gap-2 relative">
                    {/* Vertical Timeline Track */}
                    <div className="absolute left-[39px] top-6 bottom-4 w-px bg-slate-200 z-0"></div>

                    {(() => {
                      const shiftS = getCurrentShiftStart(currentTime);
                      const shiftE = getCurrentShiftEnd(currentTime);
                      
                      type TimelineEvent = {
                        id: string;
                        time: Date;
                        lineId: LineId;
                        type: 'completed' | 'plan';
                        length: number;
                        isJoint?: boolean;
                      };

                      let allEvents: TimelineEvent[] = [];

                      LINES.forEach(lineId => {
                        const mappedRolls = getComputedPlanForLine(lineId);
                        const completedRolls = lineConfigs[lineId].completedRolls || [];
                        
                        completedRolls.forEach(cr => {
                          const t = new Date(cr.unrollTime);
                          if (t.getTime() >= shiftS.getTime() && t.getTime() <= shiftE.getTime()) {
                            allEvents.push({
                              id: `c-${lineId}-${cr.id}`,
                              time: t,
                              lineId,
                              type: 'completed',
                              length: Number(cr.length) || 0
                            });
                          }
                        });

                        mappedRolls.forEach(r => {
                          const t = r.endTime;
                          if (t.getTime() >= shiftS.getTime() && t.getTime() <= shiftE.getTime()) {
                            allEvents.push({
                              id: `p-${lineId}-${r.id}`,
                              time: t,
                              lineId,
                              type: 'plan',
                              length: r.targetFormedLength,
                              isJoint: r.isJoint
                            });
                          }
                        });
                      });

                      allEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

                      if (allEvents.length === 0) {
                        return <div className="text-sm text-slate-400 italic pl-12 text-center py-4">当前班次无分卷任务</div>;
                      }

                      return allEvents.map((evt, idx) => {
                        return (
                          <div key={evt.id} className="flex items-stretch gap-4 relative z-10 group">
                            {/* Time */}
                            <div className="w-20 shrink-0 text-right py-2.5">
                              <span className="font-mono font-bold text-slate-700 text-sm">
                                {evt.time.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'})}
                              </span>
                            </div>

                            {/* Node */}
                            <div className="flex flex-col items-center">
                              <div className={cn(
                                "w-3 h-3 rounded-full mt-3 border-[3px] shadow-sm transform group-hover:scale-125 transition-transform",
                                evt.type === 'completed' ? "bg-emerald-500 border-emerald-100" : (
                                  evt.isJoint ? "bg-orange-500 border-orange-100" : "bg-blue-500 border-blue-100"
                                )
                              )}></div>
                            </div>

                            {/* Card */}
                            <div className="flex-1 py-1">
                              {evt.type === 'completed' ? (
                                <div className="flex items-center bg-white border border-emerald-200 rounded-xl px-4 py-2 gap-3 shadow-sm hover:shadow transition-shadow">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center font-black text-emerald-700">
                                    {evt.lineId}#
                                  </div>
                                  <div className="flex-1 flex flex-col">
                                    <span className="text-emerald-700 font-bold text-xs px-1.5 py-0.5 rounded bg-emerald-100/50 self-start mb-0.5">已卸卷</span>
                                  </div>
                                  <div className="text-right flex flex-col">
                                    <span className="text-slate-700 font-black text-base">{evt.length.toFixed(1)}<span className="text-xs text-slate-400 ml-0.5">m</span></span>
                                  </div>
                                </div>
                              ) : (
                                <div className={cn(
                                  "flex items-center bg-white border rounded-xl px-4 py-2 gap-3 shadow-sm hover:shadow transition-shadow",
                                  evt.isJoint ? "border-orange-300 shadow-orange-50" : "border-slate-200/80"
                                )}>
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center font-black",
                                    evt.isJoint ? "bg-orange-50 text-orange-700" : "bg-slate-50 text-slate-700"
                                  )}>
                                    {evt.lineId}#
                                  </div>
                                  <div className="flex-1 flex flex-col">
                                    {evt.isJoint ? (
                                      <div className="flex items-center gap-1.5 self-start mb-0.5">
                                        <span className="text-white font-bold text-xs px-2 py-0.5 rounded shadow-sm bg-gradient-to-r from-orange-500 to-red-500 animate-pulse">接头分卷</span>
                                      </div>
                                    ) : (
                                      <span className="text-blue-700 font-bold text-xs px-1.5 py-0.5 rounded bg-blue-50 self-start mb-0.5">分卷</span>
                                    )}
                                  </div>
                                  <div className="text-right flex flex-col">
                                    <span className={cn(
                                      "font-black text-base",
                                      evt.isJoint ? "text-orange-700" : "text-slate-800"
                                    )}>{evt.length.toFixed(1)}<span className="text-xs font-bold opacity-60 ml-0.5">m</span></span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>
              {/* Tactical Action Terminal (Right Column) */}
              <div className="flex flex-col overflow-hidden bg-slate-900 rounded-2xl shadow-xl border border-slate-800 shrink-0 h-auto min-h-[500px]">
                <div className="p-3 border-b border-slate-800 shrink-0">
                  {/* Target Line Selector global for the terminal */}
                  <div className="bg-slate-950 p-1.5 rounded-xl flex gap-1">
                    {LINES.map((line) => (
                      <button
                        key={line}
                        onClick={() => setSelectedLine(line)}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                          selectedLine === line
                            ? "bg-blue-600 text-white shadow-inner"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
                        )}
                      >
                        {line}#生产线
                      </button>
                    ))}
                  </div>
                </div>

                {/* Terminal Tabs */}
                <div className="flex border-b border-slate-800 shrink-0 overflow-x-auto hide-scrollbar">
                  {(
                    [
                      "plan",
                      "forecast",
                      "splicing",
                      "observe",
                      "wash",
                      "unroll",
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-all",
                        activeTab === tab
                          ? "text-blue-400 border-blue-500 bg-blue-500/5"
                          : "text-slate-500 border-transparent hover:text-slate-300",
                      )}
                    >
                      {tab === "plan"
                        ? "方案规划"
                        : tab === "forecast"
                          ? "用料预测"
                          : tab === "splicing"
                            ? "接箔/架子作业"
                            : tab === "observe"
                              ? "接头观测标定"
                              : tab === "wash"
                                ? "结晶冲洗"
                                : "卸卷记录"}
                    </button>
                  ))}
                </div>

                {/* Tab Content Area */}
                <div className="p-6 flex-1 overflow-y-auto bg-slate-900/50 hide-scrollbar">
                  {/* Tab: Plan */}
                  {activeTab === "plan" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                            <Settings2 size={16} />
                            分卷与卸卷规划
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            输入当前线上的参数，系统将自动划分接下来的卸卷时机与米数。
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="col-span-2">
                            <div className="flex justify-between items-end mb-1 flex-wrap gap-2">
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                                    腐蚀箔总长(m)
                                  </label>
                                  <input
                                    type="number"
                                    value={lineConfigs[selectedLine].cTotal || ""}
                                    onChange={(e) =>
                                      setLineConfigs((p) => ({
                                        ...p,
                                        [selectedLine]: {
                                          ...p[selectedLine],
                                          cTotal: Number(e.target.value),
                                        },
                                      }))
                                    }
                                    className="bg-transparent border-b border-dashed border-slate-600 text-blue-200 text-xs w-16 text-center focus:outline-none font-mono font-bold"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                                    批号:
                                  </label>
                                  <input
                                    type="text"
                                    value={
                                      lineConfigs[selectedLine].batchNo || ""
                                    }
                                    onChange={(e) =>
                                      setLineConfigs((p) => ({
                                        ...p,
                                        [selectedLine]: {
                                          ...p[selectedLine],
                                          batchNo: e.target.value,
                                        },
                                      }))
                                    }
                                    className="bg-slate-900 border border-slate-700/60 rounded px-2 py-0.5 text-xs text-emerald-300 font-mono font-bold w-32 focus:outline-none focus:border-blue-500 transition-colors"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setCutFoilLength(lineConfigs[selectedLine].fProduced.toString());
                                    setCutFoilDialog(true);
                                  }}
                                  className="bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-300 transition-colors px-2.5 py-1 rounded flex items-center gap-1.5 text-[10px] font-bold"
                                  title="提前结束当前腐蚀箔"
                                >
                                  <Scissors size={12} /> 提前割下
                                </button>
                                <button
                                  onClick={() => {
                                    setAddFoilBatch("");
                                    setAddFoilLength("");
                                    setAddFoilDialog(true);
                                  }}
                                  className="bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 transition-colors px-2.5 py-1 rounded flex items-center gap-1.5 text-[10px] font-bold"
                                  title="新增并规划一卷下一批使用的腐蚀箔"
                                >
                                  <Plus size={12} /> 新增腐蚀箔
                                </button>
                              </div>
                            </div>
                            <FoilProgressBar
                              total={lineConfigs[selectedLine].cTotal}
                              cPrev={lineConfigs[selectedLine].cPrevUsed || 0}
                              cPrevUnrolled={
                                (() => {
                                  const rolls = lineConfigs[selectedLine].completedRolls?.filter(cr => cr.isManual) || [];
                                  if (rolls.length <= 1) return 0;
                                  return rolls.slice(0, -1).reduce((acc, cr) => acc + (Number(cr.length) || 0), 0);
                                })()
                              }
                              cMineUnrolled={
                                lineConfigs[selectedLine].completedRolls?.filter(cr => !cr.isManual).reduce(
                                  (acc, cr) => acc + (Number(cr.length) || 0),
                                  0
                                ) || 0
                              }
                              cMine={
                                (lineConfigs[selectedLine].cUsed || 0) -
                                (lineConfigs[selectedLine].cPrevUsed || 0)
                              }
                              onChangePrev={(val) =>
                                setLineConfigs((p) => ({
                                  ...p,
                                  [selectedLine]: {
                                    ...p[selectedLine],
                                    cPrevUsed: val,
                                  },
                                }))
                              }
                              onChangeMine={(val) =>
                                setLineConfigs((p) => ({
                                  ...p,
                                  [selectedLine]: {
                                    ...p[selectedLine],
                                    cUsed:
                                      (p[selectedLine].cPrevUsed || 0) + val,
                                  },
                                }))
                              }
                            />
                          </div>

                          {/* Future queued rolls */}
                          {lineConfigs[selectedLine].futureRolls && lineConfigs[selectedLine].futureRolls.length > 0 && (
                            <div className="col-span-2 mb-1 p-3 bg-slate-800/40 border-l-[3px] border-l-blue-500 border border-slate-700/50 flex flex-col gap-2 rounded-r-lg">
                              <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-between">
                                <span>后续排队腐蚀箔 ({lineConfigs[selectedLine].futureRolls.length}卷)</span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {lineConfigs[selectedLine].futureRolls.map((fr, idx) => (
                                  <div key={fr.id} className="flex justify-between items-center text-xs bg-slate-900/50 rounded flex-wrap gap-2 px-2.5 py-1.5 border border-slate-700/50 group">
                                    <div className="flex flex-wrap items-center gap-3 w-max">
                                      <span className="text-slate-500 font-bold font-mono">#{idx + 1}</span>
                                      <span className="text-slate-300 font-mono">批号: {fr.batchNo}</span>
                                      <span className="text-slate-500">|</span>
                                      <span className="text-emerald-400 font-mono">总长: {fr.length} m</span>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveFutureRoll(fr.id)}
                                      className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                      title="移除该排队卷"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Completed Rolls Foldable Area */}
                          <div className="col-span-2 select-none">
                            <button
                              onClick={() =>
                                setShowCompletedRolls(!showCompletedRolls)
                              }
                              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-400 transition-colors py-2"
                            >
                              <span
                                className={cn(
                                  "transition-transform duration-200",
                                  showCompletedRolls && "rotate-90",
                                )}
                              >
                                <ChevronRight
                                  size={14}
                                  className="opacity-70"
                                />
                              </span>
                              手动录入已产化成箔
                              <span className="bg-slate-800 text-[10px] px-1.5 py-0.5 rounded-full text-slate-300">
                                {lineConfigs[selectedLine].completedRolls
                                  ?.length || 0}{" "}
                                卷
                              </span>
                            </button>

                            {showCompletedRolls && (
                              <div className="mt-2 pl-[18px] border-l-2 border-slate-700/50 mb-4 animate-in fade-in slide-in-from-top-1">
                                <div className="space-y-2">
                                  {lineConfigs[
                                    selectedLine
                                  ].completedRolls?.map((cr) => (
                                    <div
                                      key={cr.id}
                                      className="flex gap-3 text-xs bg-slate-800/40 rounded px-2 py-1.5 items-center border border-slate-700/30"
                                    >
                                      <input
                                        className="w-24 min-w-[70px] bg-transparent font-mono text-slate-300 font-bold focus:outline-none border-b border-dashed border-slate-600 focus:border-blue-400"
                                        value={cr.batchNo}
                                        onChange={(e) =>
                                          setLineConfigs((p) => ({
                                            ...p,
                                            [selectedLine]: {
                                              ...p[selectedLine],
                                              completedRolls: p[
                                                selectedLine
                                              ].completedRolls!.map((x) =>
                                                x.id === cr.id
                                                  ? {
                                                      ...x,
                                                      batchNo: e.target.value,
                                                    }
                                                  : x,
                                              ),
                                            },
                                          }))
                                        }
                                        placeholder="批号"
                                      />
                                      <div className="w-20 min-w-[60px] flex items-center border-b border-dashed border-slate-600 focus-within:border-blue-400 shrink-0">
                                        <input
                                          type="number"
                                          className="w-full bg-transparent font-mono text-emerald-400 focus:outline-none text-right [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                          value={cr.length || ""}
                                          onChange={(e) =>
                                            setLineConfigs((p) => {
                                              const newConfig = { ...p };
                                              const updatedRolls = p[selectedLine].completedRolls!.map((x) =>
                                                x.id === cr.id ? { ...x, length: Number(e.target.value) } : x
                                              );
                                              const newSum = updatedRolls.reduce((sum, r) => sum + (Number(r.length) || 0), 0);
                                              const lastLength = updatedRolls.length > 0 ? (Number(updatedRolls[updatedRolls.length - 1].length) || 0) : 0;
                                              const fProducedDiff = lastLength - (p[selectedLine].fPrevProduced || 0);
                                              
                                              newConfig[selectedLine] = {
                                                ...p[selectedLine],
                                                completedRolls: updatedRolls,
                                                cPrevUsed: newSum,
                                                cUsed: Math.max(p[selectedLine].cUsed, newSum),
                                                fPrevProduced: lastLength,
                                                fProduced: Math.max(0, p[selectedLine].fProduced + fProducedDiff)
                                              };
                                              return newConfig;
                                            })
                                          }
                                          placeholder="米数"
                                        />
                                        <span className="text-emerald-400/50 ml-0.5 text-[10px]">
                                          m
                                        </span>
                                      </div>
                                      <input
                                        type="datetime-local"
                                        className="flex-1 min-w-[110px] bg-transparent text-[10px] text-slate-400 font-mono focus:outline-none border-b border-dashed border-slate-600 focus:border-blue-400"
                                        value={
                                          cr.unrollTime
                                            ? format(
                                                new Date(cr.unrollTime),
                                                "yyyy-MM-dd'T'HH:mm",
                                              )
                                            : ""
                                        }
                                        onChange={(e) => {
                                          const newVal = e.target.value
                                            ? new Date(
                                                e.target.value,
                                              ).toISOString()
                                            : new Date().toISOString();
                                          setLineConfigs((p) => ({
                                            ...p,
                                            [selectedLine]: {
                                              ...p[selectedLine],
                                              completedRolls: p[
                                                selectedLine
                                              ].completedRolls!.map((x) =>
                                                x.id === cr.id
                                                  ? { ...x, unrollTime: newVal }
                                                  : x,
                                              ),
                                            },
                                          }));
                                        }}
                                      />
                                      <button
                                        onClick={() =>
                                          setLineConfigs((p) => {
                                            const newConfig = { ...p };
                                            const updatedRolls = p[selectedLine].completedRolls!.filter((x) => x.id !== cr.id);
                                            const newSum = updatedRolls.reduce((sum, r) => sum + (Number(r.length) || 0), 0);
                                            const lastLength = updatedRolls.length > 0 ? (Number(updatedRolls[updatedRolls.length - 1].length) || 0) : 0;
                                            const fProducedDiff = lastLength - (p[selectedLine].fPrevProduced || 0);

                                            newConfig[selectedLine] = {
                                              ...p[selectedLine],
                                              completedRolls: updatedRolls,
                                              cPrevUsed: newSum,
                                              fPrevProduced: lastLength,
                                              fProduced: Math.max(0, p[selectedLine].fProduced + fProducedDiff)
                                            };
                                            return newConfig;
                                          })
                                        }
                                        className="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-opacity p-1"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => {
                                    setLineConfigs((p) => {
                                      const newConfig = { ...p };
                                      const updatedRolls = [
                                        ...(p[selectedLine].completedRolls || []),
                                        {
                                          id: Math.random().toString(),
                                          batchNo: "",
                                          length: 0,
                                          unrollTime: new Date().toISOString(),
                                          isManual: true,
                                        },
                                      ];
                                      
                                      const newSum = updatedRolls.reduce((sum, r) => sum + (Number(r.length) || 0), 0);
                                      const lastLength = updatedRolls.length > 0 ? (Number(updatedRolls[updatedRolls.length - 1].length) || 0) : 0;
                                      const fProducedDiff = lastLength - (p[selectedLine].fPrevProduced || 0);

                                      newConfig[selectedLine] = {
                                        ...p[selectedLine],
                                        completedRolls: updatedRolls,
                                        cPrevUsed: newSum,
                                        fPrevProduced: lastLength,
                                        fProduced: Math.max(0, p[selectedLine].fProduced + fProducedDiff)
                                      };
                                      return newConfig;
                                    });
                                  }}
                                  className="mt-2 flex items-center gap-1 text-[10px] text-blue-400 font-bold hover:text-blue-300 transition-colors uppercase tracking-wider"
                                >
                                  <Plus size={12} /> 添加化成箔记录
                                </button>

                                {(!lineConfigs[selectedLine].completedRolls ||
                                  lineConfigs[selectedLine].completedRolls!
                                    .length === 0) && (
                                  <div className="mt-2 text-xs text-slate-500 italic pb-1">
                                    暂无记录，点击上方添加。
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="col-span-2 mt-2">
                            <div className="flex justify-between items-end mb-1">
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">
                                  化成箔收卷进度(m)
                                </label>
                                <span className="text-[9px] text-slate-500 ml-2">
                                  （左右拖动分界线调整米数）
                                </span>
                              </div>
                            </div>
                            <FormedFoilProgressBar
                              target={
                                lineConfigs[selectedLine].rolls[0]
                                  ?.targetFormedLength ||
                                (selectedLine === "25" ? 800 : 550)
                              }
                              fPrev={
                                lineConfigs[selectedLine].fPrevProduced || 0
                              }
                              fMine={
                                (lineConfigs[selectedLine].fProduced || 0) -
                                (lineConfigs[selectedLine].fPrevProduced || 0)
                              }
                              onChangePrev={(val) =>
                                setLineConfigs((p) => ({
                                  ...p,
                                  [selectedLine]: {
                                    ...p[selectedLine],
                                    fPrevProduced: val,
                                  },
                                }))
                              }
                              onChangeMine={(val) =>
                                setLineConfigs((p) => ({
                                  ...p,
                                  [selectedLine]: {
                                    ...p[selectedLine],
                                    fProduced:
                                      (p[selectedLine].fPrevProduced || 0) +
                                      val,
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="col-span-2 pt-2 border-t border-slate-700/50 mt-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">
                              当前车速(m/min)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={lineConfigs[selectedLine].speed || ""}
                              onChange={(e) =>
                                setLineConfigs((p) => ({
                                  ...p,
                                  [selectedLine]: {
                                    ...p[selectedLine],
                                    speed: Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-1/2 bg-slate-900 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-white font-mono mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleGlobalGeneratePlan}
                            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[13px] rounded-xl transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2"
                          >
                            <Route size={16} /> 联机全局优化排产
                          </button>
                          <button
                            onClick={handleSavePlan}
                            className={cn(
                              "flex-1 py-3 text-white font-black text-[13px] rounded-xl transition-all shadow-lg flex justify-center items-center gap-2",
                              saveSuccess
                                ? "bg-emerald-500"
                                : "bg-emerald-600 hover:bg-emerald-500 active:scale-95",
                            )}
                          >
                            {saveSuccess ? (
                              <>
                                <CheckSquare size={16} /> 已保存当前规划
                              </>
                            ) : (
                              <>
                                <CheckSquare size={16} /> 保存当前规划方案
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(() => {
                          const computed = getComputedPlanForLine(selectedLine);
                          const totalReq =
                            lineConfigs[selectedLine].cTotal -
                            lineConfigs[selectedLine].cUsed;
                          const totalTarget = computed.reduce(
                            (acc, r) => acc + r.corrosionConsumed,
                            0,
                          );
                          const gap = totalReq - totalTarget;

                          if (computed.length === 0) return null;

                          const shiftStart = getCurrentShiftStart(currentTime);
                          const shiftEnd = getCurrentShiftEnd(currentTime);
                          const maxMinutes = differenceInMinutes(shiftEnd, shiftStart);
                          let foundNextShift = false;

                          const itemsToRender = computed.filter((r) => {
                            if (foundNextShift) return false;
                            if (r.endTime.getTime() > shiftEnd.getTime()) {
                              foundNextShift = true; // render this one, drop the rest
                            }
                            return true;
                          });

                          return (
                            <>
                              <div className="flex justify-between items-center px-1">
                                <span className="text-xs font-bold text-slate-400">
                                  规划结果 (显示 {itemsToRender.length}/
                                  {computed.length} 卷)
                                </span>
                                <span
                                  className={cn(
                                    "text-[10px] font-bold shrink-0 text-right ms-2",
                                    Math.abs(gap) > 2
                                      ? "text-orange-400"
                                      : "text-emerald-400",
                                  )}
                                >
                                  {Math.abs(gap) > 2
                                    ? `耗材差异: ${gap >= 0 ? "+" : ""}${gap}m`
                                    : "耗材零损耗完美对齐"}
                                </span>
                              </div>
                              {itemsToRender.map((r, i) => {
                                const isNextShift =
                                  r.endTime.getTime() > shiftEnd.getTime();
                                return (
                                  <div
                                    key={r.id}
                                    className={cn(
                                      "p-4 rounded-xl border flex flex-col gap-2 relative transition-all",
                                      isNextShift
                                        ? "bg-indigo-950/20 border-indigo-500/30 opacity-80"
                                        : r.isJoint
                                          ? "bg-orange-950/20 border-orange-500/30"
                                          : "bg-slate-800/40 border-slate-700/60",
                                    )}
                                  >
                                    {r.isJoint && !isNextShift && (
                                      <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-xl">
                                        末端必须分卷
                                      </div>
                                    )}
                                    {isNextShift && (
                                      <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl shadow-lg border border-indigo-400/50">
                                        🌙 下一班次同事卸卷
                                      </div>
                                    )}

                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-300 border border-slate-700">
                                          {i + 1}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-200">
                                            目标化成箔长度
                                          </span>
                                          {i === 0 && lineConfigs[selectedLine].fProduced > 0 && (
                                            <span className="text-[10px] text-slate-400 mt-0.5">
                                              含接班已收 {lineConfigs[selectedLine].fProduced.toFixed(1)}m
                                            </span>
                                          )}
                                          {r.endTime && differenceInMinutes(r.endTime, shiftStart) > maxMinutes && (
                                            <span className="text-[10px] text-amber-500 mt-0.5">
                                              部分或全部在下班产
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          value={r.targetFormedLength}
                                          onChange={(e) => {
                                            const n = Number(e.target.value);
                                            const newRolls = [
                                              ...lineConfigs[selectedLine]
                                                .rolls,
                                            ];
                                            newRolls[i].targetFormedLength = n;
                                            setLineConfigs((p) => ({
                                              ...p,
                                              [selectedLine]: {
                                                ...p[selectedLine],
                                                rolls: newRolls,
                                              },
                                            }));
                                          }}
                                          className={cn(
                                            "w-20 bg-slate-950 border rounded p-1 text-center font-mono text-sm font-bold text-white outline-none",
                                            r.isWarning
                                              ? "border-red-500/70 focus:border-red-500"
                                              : "border-slate-600 focus:border-blue-400",
                                          )}
                                        />
                                        <span className="text-xs text-slate-400 w-3">
                                          m
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex justify-between items-end mt-1 pt-2 border-t border-slate-700/50">
                                      <div className="flex flex-col gap-1 mt-1">
                                        {(r.formedBatchNo || r.batchNumber) && (
                                           <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                             {r.batchNumber && (
                                               <span className="text-[9px] px-1.5 text-slate-300 bg-slate-800 rounded shadow-sm font-mono border border-slate-700">
                                                 腐蚀箔: {r.batchNumber}
                                               </span>
                                             )}
                                             {r.formedBatchNo && (
                                               <span className="text-[9px] px-1.5 text-blue-300 bg-blue-900/40 rounded shadow-sm font-mono border border-blue-800/60">
                                                 化成箔: {r.formedBatchNo}
                                               </span>
                                             )}
                                           </div>
                                        )}
                                        <div className="flex items-center gap-1.5 opacity-90">
                                          <Clock
                                            size={12}
                                            className="text-blue-400"
                                          />
                                          <span className="text-[11px] font-mono font-bold text-blue-300">
                                            预计卸卷:{" "}
                                            {format(r.endTime, "HH:mm")}
                                          </span>
                                        </div>
                                        {r.meal && (
                                          <div className="flex items-center gap-1 opacity-90">
                                            <AlertTriangle
                                              size={12}
                                              className="text-red-400"
                                            />
                                            <span className="text-[10px] font-bold text-red-400">
                                              时间冲突: {r.meal}
                                            </span>
                                          </div>
                                        )}
                                        {r.isWarning && (
                                          <div className="flex items-center gap-1 opacity-90">
                                            <AlertTriangle
                                              size={12}
                                              className="text-orange-400"
                                            />
                                            <span className="text-[10px] font-bold text-orange-400">
                                              长度合规预警 (
                                              {selectedLine === "25"
                                                ? "300-800"
                                                : "400-550"}
                                              )
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-[9px] text-slate-500 font-mono text-right shrink-0">
                                        消耗: {r.corrosionConsumed}m<br />
                                        耗时:{" "}
                                        {Math.round(
                                          r.corrosionConsumed /
                                            lineConfigs[selectedLine].speed,
                                        )}
                                        min
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Tab: Forecast */}
                  {activeTab === "forecast" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                            长远预测 (腐蚀箔)
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            录入未来几天需要使用的腐蚀箔，系统根据当前车速计算用完及出接头的时间。
                          </p>
                        </div>

                        <div className="mb-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">
                              工艺段总长(m)
                            </label>
                            <div className="flex items-center gap-2 border-b border-dashed border-slate-600 pb-2">
                              <span className="text-xs text-slate-500">
                                固定机器总长 (用于计算接头走出机器时间)：
                              </span>
                              <span className="text-blue-200 text-xs font-mono font-bold">
                                240
                              </span>
                              <span className="text-xs text-slate-500">m</span>
                            </div>
                          </div>
                        </div>

                        {/* Forecast Timeline */}
                        <div className="space-y-4">
                          {(() => {
                            const conf = lineConfigs[selectedLine];
                            const currentRem = Math.max(
                              0,
                              conf.cTotal - conf.cUsed,
                            );
                            let accMins = currentRem / conf.speed;
                            const machineLen = 240;

                            // Current Roll
                            const currentRunOutDate = addMinutes(
                              currentTime,
                              accMins,
                            );
                            const currentEmergeDate = addMinutes(
                              currentTime,
                              accMins + machineLen / conf.speed,
                            );

                            const nextRollsList = [];

                            const futureRolls = conf.futureRolls || [];
                            for (let i = 0; i < futureRolls.length; i++) {
                              const fr = futureRolls[i];
                              const startInTime = addMinutes(
                                currentTime,
                                accMins,
                              );
                              const startOutTime = addMinutes(
                                currentTime,
                                accMins + machineLen / conf.speed,
                              );

                              const rOutMins = accMins + fr.length / conf.speed;
                              const endInTime = addMinutes(
                                currentTime,
                                rOutMins,
                              );
                              const endOutTime = addMinutes(
                                currentTime,
                                rOutMins + machineLen / conf.speed,
                              );

                              nextRollsList.push({
                                ...fr,
                                startInTime,
                                startOutTime,
                                endInTime,
                                endOutTime,
                              });
                              accMins = rOutMins;
                            }

                            return (
                              <div className="flex flex-col gap-3 relative">
                                <div className="absolute left-[3px] top-4 bottom-4 w-[2px] bg-slate-700/50"></div>

                                {/* Currently running */}
                                <div className="relative pl-6">
                                  <div className="absolute left-0 top-2 w-[8px] h-[8px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                  <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-3 shrink-0">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="font-bold text-blue-100 text-xs">
                                        当前运行: {conf.batchNo || "未命名"}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        剩余 {currentRem}m
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                      <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50 text-center">
                                        <div className="text-[9px] text-slate-400 mb-1 leading-tight">
                                          本卷用完 (接头前处理)
                                        </div>
                                        <div className="text-[12px] font-mono text-orange-400 font-bold">
                                          {format(
                                            currentRunOutDate,
                                            "MM/dd HH:mm",
                                          )}
                                        </div>
                                      </div>
                                      <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50 text-center">
                                        <div className="text-[9px] text-slate-400 mb-1 leading-tight">
                                          接头出尾 (下线分卷)
                                        </div>
                                        <div className="text-[12px] font-mono text-emerald-400 font-bold">
                                          {format(
                                            currentEmergeDate,
                                            "MM/dd HH:mm",
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Future Rolls */}
                                {nextRollsList.map((r, i) => (
                                  <div
                                    key={r.id}
                                    className="relative pl-6 group"
                                  >
                                    <div className="absolute left-0 top-2 w-[8px] h-[8px] rounded-full bg-slate-600 group-hover:bg-blue-400 transition-colors"></div>
                                    <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-3 shrink-0 group-hover:border-slate-500 transition-colors">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-slate-500 font-bold group-hover:text-blue-400">
                                            #{i + 1}
                                          </span>
                                          <div className="font-bold text-slate-300 text-xs group-hover:text-white">
                                            {r.batchNo}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="text-[10px] text-slate-400 font-mono group-hover:text-blue-300">
                                            {r.length}m
                                          </div>
                                          <button
                                            onClick={() => handleRemoveFutureRoll(r.id)}
                                            className="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-opacity"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-3 flex flex-col gap-2">
                                        <div className="grid grid-cols-2 gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                                          <div className="bg-blue-500/5 rounded-lg p-2 border border-blue-500/20 text-center relative overflow-hidden">
                                            <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500/50"></div>
                                            <div className="text-[9px] text-blue-300/80 mb-1 leading-tight">
                                              始端：初上接头箔
                                            </div>
                                            <div className="text-[12px] font-mono text-blue-300 font-bold group-hover:text-blue-200">
                                              {format(
                                                r.startInTime,
                                                "MM/dd HH:mm",
                                              )}
                                            </div>
                                          </div>
                                          <div className="bg-blue-500/5 rounded-lg p-2 border border-blue-500/20 text-center relative overflow-hidden">
                                            <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500/50"></div>
                                            <div className="text-[9px] text-blue-300/80 mb-1 leading-tight">
                                              始端：接头出机器
                                            </div>
                                            <div className="text-[12px] font-mono text-blue-300 font-bold group-hover:text-blue-200">
                                              {format(
                                                r.startOutTime,
                                                "MM/dd HH:mm",
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                                          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 text-center">
                                            <div className="text-[9px] text-slate-400 mb-1 leading-tight">
                                              末端：本卷用完前处理
                                            </div>
                                            <div className="text-[12px] font-mono text-orange-400/80 font-bold group-hover:text-orange-400">
                                              {format(
                                                r.endInTime,
                                                "MM/dd HH:mm",
                                              )}
                                            </div>
                                          </div>
                                          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 text-center">
                                            <div className="text-[9px] text-slate-400 mb-1 leading-tight">
                                              末端：接头出机器
                                            </div>
                                            <div className="text-[12px] font-mono text-emerald-400/80 font-bold group-hover:text-emerald-400">
                                              {format(
                                                r.endOutTime,
                                                "MM/dd HH:mm",
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* Preview Typed Roll */}
                                {forecastBatch &&
                                  forecastLength &&
                                  !isNaN(Number(forecastLength)) &&
                                  Number(forecastLength) > 0 && (
                                    <div className="relative pl-6 group opacity-70">
                                      <div className="absolute left-0 top-2 w-[8px] h-[8px] rounded-full bg-slate-700 border border-slate-500 border-dashed"></div>
                                      <div className="bg-slate-800/50 border border-slate-700/50 border-dashed rounded-xl p-3 shrink-0">
                                        <div className="flex justify-between items-start mb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 font-bold">
                                              #预测
                                            </span>
                                            <div className="font-bold text-slate-400 text-xs italic">
                                              {forecastBatch}
                                            </div>
                                          </div>
                                          <div className="text-[10px] text-slate-400 font-mono">
                                            {forecastLength}m
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-col gap-2">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 border-dashed text-center">
                                              <div className="text-[9px] text-slate-500 mb-1 leading-tight">
                                                始端：初上接头箔
                                              </div>
                                              <div className="text-[12px] font-mono text-blue-500/60 font-bold">
                                                {format(
                                                  addMinutes(
                                                    currentTime,
                                                    accMins,
                                                  ),
                                                  "MM/dd HH:mm",
                                                )}
                                              </div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 border-dashed text-center">
                                              <div className="text-[9px] text-slate-500 mb-1 leading-tight">
                                                始端：接头出机器
                                              </div>
                                              <div className="text-[12px] font-mono text-blue-500/60 font-bold">
                                                {format(
                                                  addMinutes(
                                                    currentTime,
                                                    accMins +
                                                      machineLen / conf.speed,
                                                  ),
                                                  "MM/dd HH:mm",
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 border-dashed text-center">
                                              <div className="text-[9px] text-slate-500 mb-1 leading-tight">
                                                末端：本卷用完前处理
                                              </div>
                                              <div className="text-[12px] font-mono text-orange-500/60 font-bold">
                                                {format(
                                                  addMinutes(
                                                    currentTime,
                                                    accMins +
                                                      Number(forecastLength) /
                                                        conf.speed,
                                                  ),
                                                  "MM/dd HH:mm",
                                                )}
                                              </div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 border-dashed text-center">
                                              <div className="text-[9px] text-slate-500 mb-1 leading-tight">
                                                末端：接头出机器
                                              </div>
                                              <div className="text-[12px] font-mono text-emerald-500/60 font-bold">
                                                {format(
                                                  addMinutes(
                                                    currentTime,
                                                    accMins +
                                                      Number(forecastLength) /
                                                        conf.speed +
                                                      machineLen / conf.speed,
                                                  ),
                                                  "MM/dd HH:mm",
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                {/* Add new */}
                                <div className="relative pl-6 pt-2">
                                  <div className="bg-slate-900/80 border border-dashed border-slate-700 rounded-xl p-3">
                                    <div className="text-[10px] text-slate-400 font-bold mb-3">
                                      添加后续腐蚀箔
                                    </div>
                                    <div className="flex flex-col gap-3">
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          placeholder="批号 (如66767p)"
                                          value={forecastBatch}
                                          onChange={(e) =>
                                            setForecastBatch(e.target.value)
                                          }
                                          className="w-1/2 bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white"
                                        />
                                        <input
                                          type="number"
                                          placeholder="长度(m)"
                                          value={forecastLength}
                                          onChange={(e) =>
                                            setForecastLength(e.target.value)
                                          }
                                          className="w-1/2 bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white font-mono"
                                        />
                                      </div>
                                      <button
                                        onClick={handleAddFutureRoll}
                                        disabled={
                                          !forecastBatch || !forecastLength
                                        }
                                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded py-2 text-xs font-bold font-mono tracking-wider transition-colors flex justify-center items-center gap-2"
                                      >
                                        <Plus size={14} /> 加入预测队列
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab: Splicing */}
                  {activeTab === "splicing" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-slate-200">
                            开始接箔作业流向
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            耗时30分钟，完成后将启动过架子的延时提醒。
                          </p>
                        </div>

                        <button
                          onClick={handleStartSplicing}
                          className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Scissors size={18} />
                          确认在 {selectedLine}# 线开始接箔
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 p-4 border border-dashed border-slate-700 rounded-xl bg-slate-900/30">
                        <p className="font-bold text-slate-400 mb-2">
                          作业提示：
                        </p>
                        <ul className="space-y-1 pl-4 list-disc marker:text-slate-600">
                          <li>
                            大卷腐蚀箔长度：1500m - 2500m（偶有1000m-1500m）。
                          </li>
                          <li>
                            接箔序：上轴承、制作接头箔、烤和锤，标准时间
                            30分钟。
                          </li>
                          <li>不可在吃饭时间 (11:35等) 进行。</li>
                          <li>接箔后 15-20分钟需 "过架子" (耗时10m)。</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Tab: Wash */}
                  {activeTab === "wash" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-6">
                          <h4 className="text-sm font-bold text-slate-200">
                            登记结晶冲洗
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            冲洗耗时5-20分钟。记录后系统将重置该线的冲洗倒计时。
                          </p>
                        </div>
                        <button
                          onClick={handleRecordWash}
                          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Droplets size={18} />
                          记录 {selectedLine}# 线完成冲洗 (当前时间)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab: Observe joint */}
                  {activeTab === "observe" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-6">
                          <h4 className="text-sm font-bold text-slate-200">
                            人工接头位置校准
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            当在产线上看到接头到达某个工艺段时，立即记录。这有助于系统反推工艺段长度及校准预测（因各线车速不同与工艺段变动）。
                          </p>
                        </div>

                        <div className="space-y-4">
                          <label className="text-xs font-bold text-slate-400">
                            目前接头出现在哪个工艺环节？
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {STAGES.map((stage) => (
                              <button
                                key={stage}
                                onClick={() => setObserveStage(stage)}
                                className={cn(
                                  "py-2.5 px-3 rounded-lg text-xs font-bold border transition-all text-left",
                                  observeStage === stage
                                    ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                                    : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800",
                                )}
                              >
                                {stage}
                              </button>
                            ))}
                          </div>

                          <button className="w-full mt-4 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                            <FastForward size={16} />
                            记录接头到达 {observeStage}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab: Unroll */}
                  {activeTab === "unroll" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
                        <div className="mb-6">
                          <h4 className="text-sm font-bold text-slate-200">
                            末端分卷/卸卷登记
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">
                            接头到达生产线末端时必须分卷，系统未规划的紧急卸卷亦在此处登记。
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                              卸卷长度 (m)
                            </label>
                            <input
                              type="number"
                              placeholder="如：485"
                              value={unloadLength}
                              onChange={(e) => setUnloadLength(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-slate-200 font-mono outline-none transition-all placeholder:text-slate-600"
                            />
                          </div>
                          <button className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl transition-all active:scale-95">
                            提交分卷数据记录
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>


              </div>

            </div>
          </div>
        ) : activePage === "admin" ? (
          <div className="bg-slate-50 flex-1 overflow-auto p-4 sm:p-6 sm:rounded-3xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <button 
                  onClick={() => setActivePage("dashboard")}
                  className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                >
                  <ChevronLeft size={24} />
                  <span className="font-bold text-sm">主页</span>
              </button>
            </div>
            <AdminDashboard />
          </div>
        ) : activePage === "plan" ? (
          <div className="bg-white rounded-none sm:rounded-3xl p-4 sm:p-6 xl:p-8 sm:shadow-sm sm:border border-slate-100 flex-1 flex flex-col overflow-auto h-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActivePage("dashboard")}
                  className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                >
                  <ChevronLeft size={24} />
                  <span className="font-bold text-sm">主页</span>
                </button>
                <div className="w-10 h-10 shrink-0 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 hidden sm:flex">
                  <ListTodo size={20} />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
                  分卷计划图表与编辑
                </h2>
              </div>
              <div className="text-xs sm:text-sm text-slate-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                支持拖拽调整，自动约束产线限制
              </div>
            </div>

            <div className="flex-1 overflow-auto pr-2 hide-scrollbar">
              <CombinedPlanTimeline
                lineConfigs={lineConfigs}
                updateConfig={(id, c) =>
                  setLineConfigs((prev) => ({ ...prev, [id]: c }))
                }
                currentTime={currentTime}
                rollCompletionInputs={rollCompletionInputs}
                setRollCompletionInputs={setRollCompletionInputs}
                rollCompletionTimeInputs={rollCompletionTimeInputs}
                setRollCompletionTimeInputs={setRollCompletionTimeInputs}
                handleCompleteRoll={handleCompleteRoll}
              />
            </div>
          </div>
        ) : activePage === "settings" ? (
          <SettingsPage 
            updatedSplicingTasks={updatedSplicingTasks}
            lastWashes={lastWashes}
            currentTime={currentTime}
            LINES={LINES}
            setActivePage={setActivePage}
            handleOpenSimulator={handleOpenSimulator}
            timeOffset={timeOffset}
            shiftInfo={shiftInfo}
            handleTogglePlanningMode={handleTogglePlanningMode}
            isPlanningMode={isPlanningMode}
            showSimulator={showSimulator}
            setShowSimulator={setShowSimulator}
            simDateStr={simDateStr}
            setSimDateStr={setSimDateStr}
            simTimeStr={simTimeStr}
            setSimTimeStr={setSimTimeStr}
            resetSimulation={resetSimulation}
            applySimulation={applySimulation}
            mealConfig={mealConfig}
            setMealConfig={setMealConfig}
          />
        ) : null}
      </main>

      {/* Confirm Dialog Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto">
            <h3 className="text-lg font-bold text-slate-200 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                type="button"
              >
                取消
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
                type="button"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Foil Dialog */}
      {addFoilDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto shadow-blue-900/20">
            <h3 className="text-lg font-bold text-slate-200 mb-4">新增后续规划腐蚀箔</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">批号</label>
                <input
                  type="text"
                  value={addFoilBatch}
                  onChange={(e) => setAddFoilBatch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="请输入批号"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">总长 (m) <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  value={addFoilLength}
                  onChange={(e) => setAddFoilLength(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="例如: 3500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 flex-wrap">
              <button
                onClick={() => setAddFoilDialog(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                type="button"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (addFoilLength) {
                      const conf = lineConfigs[selectedLine];
                      const frs = conf.futureRolls || [];
                      const newConfigs = {
                        ...lineConfigs,
                        [selectedLine]: {
                          ...conf,
                          futureRolls: [
                            ...frs,
                            {
                              id: Math.random().toString(),
                              batchNo: addFoilBatch,
                              length: Number(addFoilLength),
                            },
                          ],
                        },
                      };
                    handleGeneratePlan(selectedLine, newConfigs);
                    setAddFoilBatch("");
                    setAddFoilLength("");
                  }
                }}
                disabled={!addFoilLength}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 transition-colors shadow-sm"
                type="button"
              >
                保存并继续录入
              </button>
              <button
                onClick={() => {
                  if (addFoilLength) {
                      const conf = lineConfigs[selectedLine];
                      const frs = conf.futureRolls || [];
                      const newConfigs = {
                        ...lineConfigs,
                        [selectedLine]: {
                          ...conf,
                          futureRolls: [
                            ...frs,
                            {
                              id: Math.random().toString(),
                              batchNo: addFoilBatch,
                              length: Number(addFoilLength),
                            },
                          ],
                        },
                      };
                    handleGeneratePlan(selectedLine, newConfigs);
                    setAddFoilDialog(false);
                  }
                }}
                disabled={!addFoilLength}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors shadow-sm"
                type="button"
              >
                加入规划并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cut Foil Dialog */}
      {cutFoilDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto shadow-orange-900/20">
            <h3 className="text-lg font-bold text-orange-400 mb-2">提前割下腐蚀箔</h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">这会将当前箔的总长修改为目前已用长度，代表本卷由于各种原因提前结束使用。</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">割下时的化成箔收卷进度 (m) <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  value={cutFoilLength}
                  onChange={(e) => setCutFoilLength(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  placeholder="例如: 200"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCutFoilDialog(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                type="button"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (cutFoilLength) {
                    setLineConfigs((p) => {
                      const conf = p[selectedLine];
                      return {
                        ...p,
                        [selectedLine]: {
                          ...conf,
                          cTotal: conf.cUsed, // Set etched foil total length to the used amount (as described in the prompt earlier "这会将当前箔的总长修改为目前已用长度")
                          fProduced: Number(cutFoilLength), // Adjust the formed foil progress
                        },
                      };
                    });
                    setCutFoilDialog(false);
                  }
                }}
                disabled={!cutFoilLength}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white transition-colors shadow-sm"
                type="button"
              >
                确定割下
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global utility classes for custom striping */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .bg-stripes-red {
          background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);
          background-size: 1rem 1rem;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
      `,
        }}
      />
    </div>
  );
}
