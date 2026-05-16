import React, { useState } from "react";
import { Plus, Trash2, ChevronLeft, Save, Calculator, Divide } from "lucide-react";
import { cn } from "./lib/utils";

const LINES = ["24", "25", "26"];

type RollRecord = {
  id: string;
  batchNo: string;
  length: number | "";
  startTime: string;
  splitTime: string;
  isLastRoll: boolean; // 如果是下班前最后一卷，不分卷/不卸卷
  speed: number | ""; // 车速(m/min)
  currentLength: number | ""; // 当前米数(m)
};

export default function DailyRecordPage({
  setActivePage,
}: {
  setActivePage: (page: any) => void;
}) {
  const [shiftEndTime, setShiftEndTime] = useState<"20:00" | "08:00">("20:00");
  const [confirmedLines, setConfirmedLines] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState<Record<string, RollRecord[]>>({
    "24": [],
    "25": [],
    "26": [],
  });

  const handleAddRoll = (lineId: string) => {
    if (confirmedLines[lineId]) {
      setConfirmedLines((prev) => ({ ...prev, [lineId]: false }));
    }
    const prevRolls = records[lineId];
    const lastRoll = prevRolls.length > 0 ? prevRolls[prevRolls.length - 1] : null;
    
    const newRoll: RollRecord = {
      id: Math.random().toString(36).substring(7),
      batchNo: "",
      length: "",
      startTime: lastRoll?.splitTime || "",
      splitTime: "",
      isLastRoll: false,
      speed: "",
      currentLength: "",
    };
    setRecords((prev) => ({
      ...prev,
      [lineId]: [...prev[lineId], newRoll],
    }));
  };

  const handleRemoveRoll = (lineId: string, id: string) => {
    setRecords((prev) => ({
      ...prev,
      [lineId]: prev[lineId].filter((r) => r.id !== id),
    }));
  };

  const handleUpdateRoll = (
    lineId: string,
    id: string,
    field: keyof RollRecord,
    value: any
  ) => {
    setRecords((prev) => {
      const lineRecords = [...prev[lineId]];
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
    return records[lineId].reduce((acc, curr) => {
      const val = parseFloat(String(curr.length));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  };

  const calculateLastRoll = (lineId: string, roll: RollRecord) => {
    if (roll.speed !== "" && roll.currentLength !== "") {
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
      const calcLen = Number(roll.currentLength) + Number(roll.speed) * diffMins;
      
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
        {LINES.map((lineId) => (
          <div
            key={lineId}
            className="bg-white border text-left border-slate-200 rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-black text-sm flex items-center justify-center">
                  {lineId}#
                </span>
                <span className="font-bold text-slate-700">产线记录</span>
              </div>
              <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                合计: {calculateTotalLength(lineId).toFixed(1)} m
              </span>
            </div>

            <div className="space-y-3">
             <div className="hidden sm:grid grid-cols-[1.5fr_0.8fr_1fr_1fr_auto] gap-2 px-2 text-xs font-bold text-slate-400">
                <div>批次号</div>
                <div>米数(m)</div>
                <div>起卷时间</div>
                <div>分卸状态/时间</div>
                <div className="w-6"></div>
              </div>

              {records[lineId].length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm font-bold bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  暂无记录
                </div>
              ) : (
                records[lineId].map((r, index) => (
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
                          <div className="text-[13px] font-bold text-indigo-600 py-1.5">{r.length ? `${r.length} m` : "-"}</div>
                        ) : (
                          <input
                            type="number"
                            placeholder="米数"
                            value={r.length}
                            onChange={(e) =>
                              handleUpdateRoll(lineId, r.id, "length", e.target.value)
                            }
                            step="0.1"
                            className="w-full bg-white border border-slate-200 text-indigo-700 rounded p-1.5 text-[13px] font-bold shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
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
                            {index === records[lineId].length - 1 && (
                              <label className={cn("flex items-center gap-1 cursor-pointer mt-0.5", r.isLastRoll && "h-8")}>
                                <input 
                                  type="checkbox"
                                  checked={r.isLastRoll}
                                  onChange={(e) => handleUpdateRoll(lineId, r.id, "isLastRoll", e.target.checked)}
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
                            value={r.speed}
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

              {records[lineId].length > 0 && (
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
