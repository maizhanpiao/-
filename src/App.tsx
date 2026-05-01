import React, { useState, useEffect, useRef } from "react";
import AdminDashboard from "./AdminDashboard";
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

    // Estimate speed: time = length / speed. pixel width = 12h = 720 mins.
    // So 1 pixel = (720 / containerWidth) mins = (720 / containerWidth) * speed meters.

    const container = containerRef.current?.parentElement?.parentElement;
    if (!container) return;
    const containerWidth = container.clientWidth;

    const handleMouseMove = (e2: MouseEvent) => {
      const dx = e2.clientX - startX;
      // widthPct change = (dx / containerWidth) * 100
      // 100% width = 12 hours = 720 mins
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

  const machineLen = 240; // constant speed fixed machine length
  const emergeDelayMins = machineLen / (r.speed || 1.3);
  const emergeWHeight = (emergeDelayMins / 720) * 100;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute top-[1px] bottom-[1px] rounded-sm group overflow-visible z-10",
        r.isJoint ? "z-20" : "",
      )}
      style={{
        left: `${Math.max(0, leftPct)}%`,
        width: `${Math.min(100 - Math.max(0, leftPct), wPct - (leftPct < 0 ? -leftPct : 0))}%`,
      }}
    >
      {/* Background */}
      <div
        className={cn(
          "absolute inset-0 shadow-sm border-r border-slate-400 overflow-hidden",
          r.isJoint
            ? "bg-orange-500/80 border-orange-700 border-l border-l-orange-700"
            : "bg-blue-500/20 border-blue-500 border-l border-l-blue-500",
        )}
      />

      {/* Labeling on Hover */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none z-30 whitespace-nowrap flex flex-col items-center gap-0.5">
        <span className="text-[9px] font-bold px-1 bg-white border border-slate-200 rounded shadow-sm">
          {r.targetFormedLength}m
        </span>
        {(r.formedBatchNo || r.batchNumber) && (
          <span className="text-[8px] px-1 bg-blue-50 text-blue-700 border border-blue-200 rounded shadow-sm font-mono">
            {r.formedBatchNo || r.batchNumber}
          </span>
        )}
      </div>

      {/* Separator / Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 bottom-0 w-2 translate-x-1/2 cursor-ew-resize hover:bg-blue-500/50 z-20 flex items-center justify-center group-hover:opacity-100 opacity-50"
      >
        <div className="w-[1px] h-3 bg-slate-800" />
      </div>

      {/* Markers */}
      <div className="absolute right-0 bottom-full mb-0.5 whitespace-nowrap pointer-events-none flex flex-col items-end z-30">
        {r.isJoint ? (
          <div className="translate-x-1/2 flex flex-col items-center">
            <div className="text-[8px] font-black text-orange-600 bg-orange-100 border border-orange-200 px-1 rounded transform scale-75 origin-bottom">
              接箔
            </div>
            <div className="w-[1px] h-1 bg-orange-500"></div>
          </div>
        ) : (
          <div className="translate-x-1/2 flex flex-col items-center">
            <div className="text-[8px] font-bold text-blue-600 transform scale-75 origin-bottom">
              分卷
            </div>
            <div className="w-[1px] h-1 bg-blue-400"></div>
          </div>
        )}
      </div>

      {/* Special Unroll (特殊分卷) Marker */}
      {r.isJoint && wPct > 0 && (
        <div
          className="absolute bottom-[-18px] z-30 pointer-events-none flex flex-col items-center"
          style={{
            left: `calc(100% + ${(emergeWHeight / wPct) * 100}%)`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="w-[1px] h-1 bg-violet-400"></div>
          <div className="text-[8px] font-bold text-violet-600 bg-violet-100 border border-violet-200 px-1 rounded transform scale-75 origin-top mt-0.5 whitespace-nowrap">
            特殊分卷
          </div>
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
            const totalToForm = config.fProduced + config.cTotal - config.cUsed;
            const minL = lineId === "25" ? 300 : 400;
            const maxL = lineId === "25" ? 800 : 550;

            const cumSum: number[] = [];
            let acc = 0;
            config.rolls.forEach((r) => {
              acc += r.targetFormedLength;
              cumSum.push(acc);
            });

            return (
              <div key={lineId} className="flex flex-col group relative w-full mb-2">
                <div className="flex items-center gap-1.5 mb-1.5 sticky left-0 z-20 w-fit mix-blend-multiply">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="font-black text-slate-800 text-xs sm:text-sm">{lineId}# 线</span>
                </div>
                <div className="relative h-10 sm:h-12 rounded-lg border border-slate-200 shadow-sm bg-white overflow-hidden">
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
                                    <span className="font-bold text-slate-700 bg-slate-100 flex items-center rounded text-xs border border-slate-200 overflow-hidden shadow-sm">
                                      <span className="px-2 py-1 bg-slate-200/50">{roll.isCompleted ? "✅ 已卸卷" : `卷 #${roll.index + 1}`}</span>
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
                                    <span className={cn("text-sm font-black", roll.isCompleted ? "text-slate-500" : "text-blue-600")}>
                                      {roll.isCompleted ? roll.actualLength?.toFixed(1) : roll.targetFormedLength.toFixed(1)} m
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
  cMineUnrolled,
  cMine,
  onChangePrev,
  onChangeMine,
}: {
  total: number;
  cPrev: number;
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
              上班已用: {cPrev}m
            </span>
          )}
          {cMineUnrolled > 0 && (
            <span className="text-emerald-200 z-20 drop-shadow-md">
              已卸卷: {cMineUnrolled}m
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
      className="absolute inset-0 z-10 select-none overflow-hidden rounded"
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

        return (
          <div
            key={roll.id}
            className="absolute top-0 bottom-0 border-r border-white flex flex-col items-center justify-center group pointer-events-none"
            style={{
              left: `${pctLeft}%`,
              width: `${pctWidth}%`,
              backgroundColor: `hsl(215, 80%, ${i % 2 === 0 ? "90%" : "85%"})`,
            }}
          >
            {/* Only show label if there's enough space width-wise or it's not off-screen to the left */}
            {pctLeft + pctWidth > 0 && (
              <span className="text-[10px] font-black text-blue-900/80 pointer-events-auto">
                {roll.targetFormedLength.toFixed(1)}m
              </span>
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSimulator, setShowSimulator] = useState(false);
  const [simDateStr, setSimDateStr] = useState("");
  const [simTimeStr, setSimTimeStr] = useState("");

  const [activePage, setActivePage] = useState<"dashboard" | "plan" | "admin">("dashboard");

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
    setLineConfigs((p) => {
      const lineConf = p[selectedLine];
      const frs = lineConf.futureRolls || [];
      return {
        ...p,
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
    });
    setForecastBatch("");
    setForecastLength("");
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
    const timer = setInterval(
      () => setCurrentTime(new Date(Date.now() + timeOffset)),
      1000,
    );
    return () => clearInterval(timer);
  }, [timeOffset]);

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
    setCurrentTime(new Date(Date.now() + offset));
    setShowSimulator(false);
  };

  const resetSimulation = () => {
    setTimeOffset(0);
    setCurrentTime(new Date());
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
    if (L <= 0) return currentLineConfigs;
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

    let totalToForm = conf.fProduced + L;

    const evaluate = (targets: number[]) => {
      let p = 0;
      let acc = 0;
      for (let i = 0; i < targets.length; i++) {
        const tL = targets[i];
        // check format constraints
        if (tL < minL) p += (minL - tL) * 200;
        if (tL > maxL) p += (tL - maxL) * 200;
        p += Math.abs(tL - avg);

        let cConsum = i === 0 ? tL - conf.fProduced : tL;
        if (i === targets.length - 1) cConsum = L - acc;
        if (cConsum < 0) cConsum = 0;
        acc += cConsum;

        const endTime = new Date(
          currentTime.getTime() + (acc / conf.speed) * 60000,
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
      if (t1 < conf.fProduced) t1 = conf.fProduced;
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
        if (i === 0) minTake = Math.max(minTake, conf.fProduced);

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

    let newRolls: PlannedRoll[] = [];
    let accumulatedC = 0;

    for (let i = 0; i < bestTargets.length; i++) {
      let targetL = bestTargets[i];
      let cConsum = i === 0 ? targetL - conf.fProduced : targetL;
      targetL = Number(targetL.toFixed(1));

      if (i === bestTargets.length - 1) {
        cConsum = Number((L - accumulatedC).toFixed(1));
        targetL = Number(
          (i === 0 ? conf.fProduced + cConsum : cConsum).toFixed(1),
        );
      }
      accumulatedC += cConsum;

      newRolls.push({
        id: Math.random().toString(),
        targetFormedLength: targetL,
        isJoint: i === bestTargets.length - 1,
        batchNumber: conf.batchNo || "",
      });
    }

    const nextConfigs = {
      ...currentLineConfigs,
      [lineId]: { ...conf, rolls: newRolls },
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
                  <div className="relative inline-block mt-1">
                  <button
                    onClick={handleOpenSimulator}
                    className="text-[13px] font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-2 px-2 py-1 -ml-2 rounded-lg hover:bg-black/5 transition-colors"
                    title="点击开启时间和排程模拟器"
                  >
                    <Clock
                      size={14}
                      className={
                        timeOffset !== 0 ? "text-orange-500" : "text-slate-400"
                      }
                    />
                    {format(currentTime, "yyyy年MM月dd日 HH:mm:ss")}
                    {timeOffset !== 0 ? (
                      <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] ml-1 font-bold border border-orange-200 animate-pulse hidden sm:inline-block">
                        模拟运行中
                      </span>
                    ) : (
                      shiftInfo.type === "Rest" && (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] ml-1 font-bold hidden sm:inline-block">
                          休息日
                        </span>
                      )
                    )}
                    <Settings2 size={14} className="opacity-50 ml-1" />
                  </button>

                  {showSimulator && (
                    <div className="absolute top-full left-0 mt-3 w-72 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                        <h4 className="text-white font-bold text-sm flex items-center gap-2">
                          <Settings2 size={14} className="text-blue-400" />
                          系统时钟控制中心
                        </h4>
                        <button
                          onClick={() => setShowSimulator(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          &times;
                        </button>
                      </div>
                      <div className="p-4 space-y-4">
                        <p className="text-[10px] text-slate-500 font-medium">
                          调整系统时间，快速切换工作日/休息日状态或测试交接班、排产规划等不同时间场景。
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              目标日期
                            </label>
                            <input
                              type="date"
                              value={simDateStr}
                              onChange={(e) => setSimDateStr(e.target.value)}
                              className="w-full text-xs p-2 border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              目标时间
                            </label>
                            <input
                              type="time"
                              value={simTimeStr}
                              onChange={(e) => setSimTimeStr(e.target.value)}
                              className="w-full text-xs p-2 border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={resetSimulation}
                            className="flex-1 py-2.5 bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            恢复实际
                          </button>
                          <button
                            onClick={applySimulation}
                            className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-colors"
                          >
                            应用模拟
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>

              {/* Quick status pills */}
              <div className="flex gap-3">
                <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm flex flex-col justify-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    当前排程
                  </span>
                  <span className="text-sm font-bold text-slate-700">
                    {viewShiftInfo.timeStr}
                  </span>
                </div>
                {viewShiftInfo.type === "Day" && (
                  <div className="bg-orange-50/80 border border-orange-200/60 px-4 py-2.5 rounded-xl shadow-sm flex flex-col justify-center">
                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-0.5">
                      即将到来的进餐约束
                    </span>
                    <span className="text-sm font-bold text-orange-700 flex items-center gap-1.5">
                      <AlertCircle size={14} /> 11:35 或 17:10
                    </span>
                  </div>
                )}
              </div>
            </header>

            <div className="flex flex-col lg:max-w-4xl mx-auto w-full gap-6 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden pb-20 md:pb-0">
              {/* Timeline Context (Left Column) */}
              <div className="w-full max-w-full flex flex-col gap-6 xl:overflow-y-auto pr-2 pb-4 hide-scrollbar">
                {/* 12 Hour Shift Timeline */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 shrink-0">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2 text-slate-800">
                      <Activity size={18} className="text-blue-500" />
                      当前班次宏观规划图
                      <span className="text-xs font-normal text-slate-400 ml-2">
                        (
                        {getCurrentShiftStart(currentTime).getHours() === 20
                          ? "20:00 - 08:00"
                          : "08:00 - 20:00"}
                        )
                      </span>
                    </h3>
                  </div>

                  <div className="-mx-4 sm:mx-0 w-[calc(100%+32px)] sm:w-full border-y sm:border-none p-3 sm:p-5 h-[160px] relative overflow-x-auto hide-scrollbar">
                    <div className="h-full relative">
                      {/* Timeline Background & Ticks */}
                      <div className="absolute left-6 right-6 top-8 bottom-4 flex">
                      {[...Array(12)].map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 border-l border-slate-100 relative group"
                        >
                          <span className={`absolute -top-6 ${i === 0 ? '' : '-translate-x-1/2'} text-[10px] font-bold text-slate-400`}>
                            {((getCurrentShiftStart(currentTime).getHours() ===
                            20
                              ? 20
                              : 8) +
                              i) %
                              24}
                            h
                          </span>
                        </div>
                      ))}
                        {/* 12th Hour Tick (End) */}
                        <div className="border-l border-slate-100 relative h-full">
                          <span className="absolute -top-6 -translate-x-full text-[10px] font-bold text-slate-400">
                            {((getCurrentShiftStart(currentTime).getHours() ===
                            20
                              ? 20
                              : 8) +
                              12) %
                              24}
                            h
                          </span>
                        </div>
                    </div>

                    {/* Render Computed Line Plans */}
                    <div className="absolute left-6 right-6 top-8 bottom-4 flex flex-col gap-1">
                      {LINES.map((lineId) => {
                        const mappedRolls = getComputedPlanForLine(lineId);
                        if (mappedRolls.length === 0) return null;

                        let shiftS = getCurrentShiftStart(currentTime);

                        return (
                          <div
                            key={lineId}
                            className="h-[14px] w-full relative border-b border-slate-100/50 mt-1"
                          >
                            {lineConfigs[lineId].completedRolls?.map((cr: any, i: number) => {
                              const endTime = new Date(cr.unrollTime);
                              const endMinutesFromStart = differenceInMinutes(endTime, shiftS);
                              const startMinutesFromStart = endMinutesFromStart - cr.length / lineConfigs[lineId].speed;
                              const maxMinutes = differenceInMinutes(getCurrentShiftEnd(currentTime), shiftS);
                              
                              const pctLeft = (startMinutesFromStart / maxMinutes) * 100;
                              const pctWidth = ((cr.length / lineConfigs[lineId].speed) / maxMinutes) * 100;
                              
                              if (pctLeft > 100 || pctLeft + pctWidth < 0) return null;

                              return (
                                <div
                                  key={`completed-${cr.id}`}
                                  className="absolute top-0 bottom-0 flex flex-col items-center justify-center group pointer-events-none rounded-full border-r border-slate-100/50"
                                  style={{
                                    left: `${Math.max(0, pctLeft)}%`,
                                    width: `${pctLeft < 0 ? pctWidth + pctLeft : pctWidth}%`,
                                    backgroundColor: `hsl(145, 60%, ${i % 2 === 0 ? "80%" : "75%"})`, // emerald color
                                  }}
                                >
                                  {pctLeft + pctWidth > 0 && pctLeft < 100 && (
                                    <span className="text-[8px] font-black text-emerald-900/80 pointer-events-auto">
                                      已卸
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {mappedRolls.map((r) => {
                              const leftPct =
                                ((r.startTime.getTime() - shiftS.getTime()) /
                                  (3600000 * 12)) *
                                100;
                              const wPct =
                                ((r.endTime.getTime() - r.startTime.getTime()) /
                                  (3600000 * 12)) *
                                100;
                              if (leftPct > 100 || leftPct + wPct < 0)
                                return null;

                              return (
                                <TimelineRoll
                                  key={r.id}
                                  r={{ ...r, speed: lineConfigs[lineId].speed }}
                                  leftPct={leftPct}
                                  wPct={wPct}
                                  lineId={lineId}
                                  onChangeLength={(id, newLen) => {
                                    setLineConfigs((prev) => {
                                      const rolls = [...prev[lineId].rolls];
                                      const idx = rolls.findIndex(
                                        (rl) => rl.id === id,
                                      );
                                      if (idx > -1) {
                                        rolls[idx] = {
                                          ...rolls[idx],
                                          targetFormedLength: Math.max(
                                            10,
                                            Math.round(newLen),
                                          ),
                                        };
                                      }
                                      return {
                                        ...prev,
                                        [lineId]: { ...prev[lineId], rolls },
                                      };
                                    });
                                  }}
                                />
                              );
                            })}
                            <span className="absolute -left-5 top-[1px] text-[8px] font-bold text-slate-400">
                              {lineId}#
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Constraint Overlays */}
                    <div className="absolute left-6 right-6 top-8 bottom-4">
                      {(() => {
                        const shiftS = getCurrentShiftStart(currentTime);
                        const shiftH = shiftS.getHours();

                        const renderMeal = (startH: number, endH: number) => {
                          let relH = startH - shiftH;
                          if (relH < 0) relH += 24;
                          let wH = endH - startH;
                          if (wH < 0) wH += 24;

                          if (relH > 12) return null; // not in this shift

                          const leftPct = (relH / 12) * 100;
                          const wPct = (wH / 12) * 100;

                          return (
                            <div
                              title="进餐时间约束 (双击调整)"
                              onDoubleClick={() => {
                                const isLunch =
                                  startH === mealConfig.lunchStart;
                                const curEnd = isLunch
                                  ? mealConfig.lunchEnd
                                  : mealConfig.dinnerEnd;
                                const curS = `${Math.floor(startH)}:${Math.floor(
                                  (startH % 1) * 60,
                                )
                                  .toString()
                                  .padStart(2, "0")}`;
                                const curE = `${Math.floor(curEnd)}:${Math.floor(
                                  (curEnd % 1) * 60,
                                )
                                  .toString()
                                  .padStart(2, "0")}`;
                                const res = prompt(
                                  `${isLunch ? "午间" : "晚间"}进餐时间范围 (格式: HH:MM-HH:MM)`,
                                  `${curS}-${curE}`,
                                );
                                if (res && res.includes("-")) {
                                  const parts = res.split("-");
                                  if (
                                    parts.length === 2 &&
                                    parts[0].includes(":") &&
                                    parts[1].includes(":")
                                  ) {
                                    const [sh, sm] = parts[0]
                                      .split(":")
                                      .map(Number);
                                    const [eh, em] = parts[1]
                                      .split(":")
                                      .map(Number);
                                    if (
                                      !isNaN(sh) &&
                                      !isNaN(sm) &&
                                      !isNaN(eh) &&
                                      !isNaN(em)
                                    ) {
                                      setMealConfig((p) => ({
                                        ...p,
                                        ...(isLunch
                                          ? {
                                              lunchStart: sh + sm / 60,
                                              lunchEnd: eh + em / 60,
                                            }
                                          : {
                                              dinnerStart: sh + sm / 60,
                                              dinnerEnd: eh + em / 60,
                                            }),
                                      }));
                                    }
                                  }
                                }
                              }}
                              className="absolute top-0 bottom-0 bg-stripes-red rounded bg-red-50/50 border border-red-200 flex items-center justify-center -z-10 hover:bg-red-50 hover:cursor-pointer transition-colors"
                              style={{ left: `${leftPct}%`, width: `${wPct}%` }}
                            >
                              <span className="text-[10px] font-black text-red-500 rotate-90 xl:rotate-0 tracking-widest uppercase">
                                进餐时段
                              </span>
                            </div>
                          );
                        };

                        return (
                          <>
                            {renderMeal(
                              mealConfig.lunchStart,
                              mealConfig.lunchEnd,
                            )}
                            {renderMeal(
                              mealConfig.dinnerStart,
                              mealConfig.dinnerEnd,
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Current Time Indicator (if currently in this shift) */}
                    <div className="absolute left-6 right-6 top-8 bottom-4 pointer-events-none">
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-blue-500 z-20"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((currentTime.getTime() - getCurrentShiftStart(currentTime).getTime()) / (12 * 3600000)) * 100))}%`,
                        }}
                      >
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full absolute -top-1 -left-[5px] ring-4 ring-blue-500/20 shadow-lg"></div>
                      </div>
                    </div>
                    </div>
                  </div>
                </section>
              {/* Tactical Action Terminal (Right Column) */}
              <div className="flex flex-col overflow-hidden bg-slate-900 rounded-2xl shadow-xl border border-slate-800 shrink-0 h-auto min-h-[500px]">
                <div className="p-5 border-b border-slate-800 shrink-0">
                  <h3 className="text-white font-bold tracking-wider flex items-center gap-2">
                    <Wrench size={18} className="text-blue-400" />
                    现场作业终端机
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    记录现场动态，辅助算法校准与预测
                  </p>

                  {/* Target Line Selector global for the terminal */}
                  <div className="mt-5 bg-slate-950 p-2 rounded-xl flex gap-1">
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
                            <div className="flex justify-between items-end mb-1">
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
                            <FoilProgressBar
                              total={lineConfigs[selectedLine].cTotal}
                              cPrev={lineConfigs[selectedLine].cPrevUsed || 0}
                              cMineUnrolled={
                                lineConfigs[selectedLine].completedRolls?.reduce(
                                  (acc, cr) => acc + cr.length,
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
                              查看已生产的化成箔
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
                                                        length: Number(
                                                          e.target.value,
                                                        ),
                                                      }
                                                    : x,
                                                ),
                                              },
                                            }))
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
                                          setLineConfigs((p) => ({
                                            ...p,
                                            [selectedLine]: {
                                              ...p[selectedLine],
                                              completedRolls: p[
                                                selectedLine
                                              ].completedRolls!.filter(
                                                (x) => x.id !== cr.id,
                                              ),
                                            },
                                          }))
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
                                    setLineConfigs((p) => ({
                                      ...p,
                                      [selectedLine]: {
                                        ...p[selectedLine],
                                        completedRolls: [
                                          ...(p[selectedLine].completedRolls ||
                                            []),
                                          {
                                            id: Math.random().toString(),
                                            batchNo: "",
                                            length: 0,
                                            unrollTime:
                                              new Date().toISOString(),
                                          },
                                        ],
                                      },
                                    }));
                                  }}
                                  className="mt-2 flex items-center gap-1 text-[10px] text-blue-400 font-bold hover:text-blue-300 transition-colors uppercase tracking-wider"
                                >
                                  <Plus size={12} /> 添加化成箔卸卷记录
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

                          const shiftEnd = getCurrentShiftEnd(currentTime);
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
                                        <span className="text-xs font-bold text-slate-200">
                                          目标化成箔长度
                                        </span>
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
                                            onClick={() => {
                                              setLineConfigs((p) => {
                                                const lineConf =
                                                  p[selectedLine];
                                                return {
                                                  ...p,
                                                  [selectedLine]: {
                                                    ...lineConf,
                                                    futureRolls:
                                                      lineConf.futureRolls!.filter(
                                                        (x) => x.id !== r.id,
                                                      ),
                                                  },
                                                };
                                              });
                                            }}
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

                {/* Middle Section: Alerts and Active Tasks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
                  {/* Splicing Tasks Panel */}
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-[280px]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold flex items-center gap-2 text-slate-800">
                        <Scissors size={18} className="text-orange-500" />
                        接箔与过架进程监控
                      </h3>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                        {updatedSplicingTasks.length} 项进行中
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 hide-scrollbar">
                      {updatedSplicingTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-80">
                          <CheckSquare size={32} className="mb-2 opacity-50" />
                          <p className="text-xs font-medium">
                            当前无正在进行的接箔作业
                          </p>
                        </div>
                      ) : (
                        updatedSplicingTasks.map((task) => (
                          <div
                            key={task.id}
                            className={cn(
                              "p-4 rounded-xl border flex flex-col gap-3 transition-all",
                              task.urgency === "critical"
                                ? "bg-red-50 border-red-200"
                                : task.urgency === "warning"
                                  ? "bg-orange-50 border-orange-200"
                                  : "bg-slate-50 border-slate-200",
                            )}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider text-white",
                                    task.line === "24"
                                      ? "bg-blue-600"
                                      : task.line === "25"
                                        ? "bg-indigo-600"
                                        : "bg-violet-600",
                                  )}
                                >
                                  {task.line}#
                                </span>
                                <span
                                  className={cn(
                                    "text-xs font-bold",
                                    task.urgency === "critical"
                                      ? "text-red-700"
                                      : task.urgency === "warning"
                                        ? "text-orange-700"
                                        : "text-slate-700",
                                  )}
                                >
                                  {task.displayStatus}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500 font-bold">
                                自 {format(task.startTime, "HH:mm")} 开始
                              </span>
                            </div>

                            {/* Mini Progress bar */}
                            <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-1000",
                                  task.urgency === "critical"
                                    ? "bg-red-500"
                                    : task.urgency === "warning"
                                      ? "bg-orange-500"
                                      : "bg-slate-600",
                                )}
                                style={{
                                  width: `${Math.min(100, task.progress)}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Wash Status Panel */}
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-[280px]">
                    <h3 className="font-bold flex items-center gap-2 text-slate-800 mb-4">
                      <Droplets size={18} className="text-blue-400" />
                      结晶冲洗状态预警 (目标: 约2H/次)
                    </h3>

                    <div className="flex-1 flex flex-col justify-around">
                      {LINES.map((line) => {
                        const lastWash = lastWashes[line];
                        let statusText = "暂无记录 (需冲洗)";
                        let statusColor =
                          "text-slate-500 bg-slate-100 border-slate-200";
                        let barColor = "bg-slate-200";
                        let elapsedMin = 0;

                        if (lastWash) {
                          elapsedMin = differenceInMinutes(
                            currentTime,
                            lastWash,
                          );
                          if (elapsedMin < 90) {
                            statusText = `安全范围内 (${elapsedMin}m)`;
                            statusColor =
                              "text-emerald-700 bg-emerald-50 border-emerald-200";
                            barColor = "bg-emerald-400";
                          } else if (elapsedMin < 120) {
                            statusText = `准备冲洗 (${elapsedMin}m 预警)`;
                            statusColor =
                              "text-orange-700 bg-orange-50 border-orange-200";
                            barColor = "bg-orange-400";
                          } else {
                            statusText = `急需冲洗 超时 (${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m)`;
                            statusColor =
                              "text-red-700 bg-red-50 border-red-200 animate-pulse";
                            barColor = "bg-red-500";
                          }
                        }

                        return (
                          <div
                            key={line}
                            className="flex items-center gap-4 group"
                          >
                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                              <span className="text-sm font-black text-slate-700">
                                {line}#
                              </span>
                            </div>
                            <div
                              className={cn(
                                "flex-1 relative border rounded-lg p-2.5 overflow-hidden flex justify-between items-center transition-colors",
                                statusColor,
                              )}
                            >
                              <span className="text-xs font-bold relative z-10">
                                {statusText}
                              </span>
                              <span className="text-[10px] font-mono opacity-60 font-bold relative z-10 truncate ml-2">
                                {lastWash
                                  ? `已上次于 ${format(lastWash, "HH:mm")}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                {/* Context/Line metrics... */}
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-y sm:divide-y-0 border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden shrink-0">
                  <div className="p-4 sm:p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        24#线合规长度
                      </p>
                      <p className="text-base sm:text-lg font-bold">
                        400-550
                        <span className="text-xs text-slate-500 ml-1">m</span>
                      </p>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        25#线合规长度
                      </p>
                      <p className="text-base sm:text-lg font-bold">
                        300-800
                        <span className="text-xs text-slate-500 ml-1">m</span>
                      </p>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center shrink-0">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        26#线合规长度
                      </p>
                      <p className="text-base sm:text-lg font-bold">
                        400-550
                        <span className="text-xs text-slate-500 ml-1">m</span>
                      </p>
                    </div>
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
        ) : null}
      </main>

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
