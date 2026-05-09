import React from 'react';
import { Scissors, CheckSquare, Droplets, Package, ChevronLeft, Clock, AlertCircle, Settings2 } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { cn } from './lib/utils'; 

export function SettingsPage({
  updatedSplicingTasks, lastWashes, currentTime, LINES, setActivePage,
  handleOpenSimulator, timeOffset, shiftInfo, handleTogglePlanningMode, 
  isPlanningMode, showSimulator, setShowSimulator, simDateStr, 
  setSimDateStr, simTimeStr, setSimTimeStr, resetSimulation, applySimulation,
  mealConfig, setMealConfig
}: any) {
  return (
    <div className="bg-slate-50 flex-1 overflow-auto p-4 sm:p-6 sm:rounded-3xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setActivePage("dashboard")}
                className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors shrink-0 flex items-center gap-1"
            >
                <ChevronLeft size={24} />
                <span className="font-bold text-sm">主页</span>
            </button>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800">设置与监控</h2>
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {/* System Time and Planning Mode */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold flex items-center gap-2 text-slate-800">
                <Settings2 size={18} className="text-blue-500" />
                系统状态
              </h3>
              <button 
                onClick={() => {
                  const curLS = `${Math.floor(mealConfig.lunchStart)}:${Math.floor((mealConfig.lunchStart % 1) * 60).toString().padStart(2, "0")}`;
                  const curLE = `${Math.floor(mealConfig.lunchEnd)}:${Math.floor((mealConfig.lunchEnd % 1) * 60).toString().padStart(2, "0")}`;
                  const curDS = `${Math.floor(mealConfig.dinnerStart)}:${Math.floor((mealConfig.dinnerStart % 1) * 60).toString().padStart(2, "0")}`;
                  const curDE = `${Math.floor(mealConfig.dinnerEnd)}:${Math.floor((mealConfig.dinnerEnd % 1) * 60).toString().padStart(2, "0")}`;
                  const isNight = !!shiftInfo && shiftInfo.id.includes("Night");

                  const curS = isNight ? curDS : curLS;
                  const curE = isNight ? curDE : curLE;

                  const res = prompt(
                    `${isNight ? "夜间" : "白班"}进餐时间范围 (格式: HH:MM-HH:MM)`,
                    `${curS}-${curE}`
                  );
                  if (res && res.includes("-")) {
                    const parts = res.split("-");
                    if (parts.length === 2 && parts[0].includes(":") && parts[1].includes(":")) {
                      const [sh, sm] = parts[0].split(":").map(Number);
                      const [eh, em] = parts[1].split(":").map(Number);
                      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
                        setMealConfig((p: any) => ({
                          ...p,
                          ...(!isNight ? { lunchStart: sh + sm / 60, lunchEnd: eh + em / 60 } : { dinnerStart: sh + sm / 60, dinnerEnd: eh + em / 60 })
                        }));
                      }
                    }
                  }
                }}
                className="text-xs text-blue-500 hover:text-blue-600 underline font-medium"
              >
                设置进餐时间
              </button>
            </div>
              <p className="text-sm text-slate-500 mb-5">
                调整系统时间，快速切换工作日/休息日状态或测试交接班、排产规划等不同时间场景。
              </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleTogglePlanningMode}
                className={cn(
                  "text-sm font-bold px-4 py-2 rounded-lg transition-colors border flex items-center gap-2",
                  isPlanningMode
                    ? "bg-purple-100 text-purple-700 border-purple-300"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                )}
                title="规划模式下，时间会自动锁定在当前班次的开始时间"
              >
                <Settings2 size={16} />
                {isPlanningMode ? "规划模式: 开" : "规划模式: 关"}
              </button>

              <button
                onClick={handleOpenSimulator}
                className="text-sm font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
                title="点击开启时间和排程模拟器"
              >
                <Clock
                  size={16}
                  className={
                    timeOffset !== 0 ? "text-orange-500" : "text-slate-500"
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
              </button>
            </div>
            
            {showSimulator && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl relative overflow-hidden">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2">
                        <Settings2 size={14} className="text-blue-500" />控制中心
                    </h4>
                    <button onClick={() => setShowSimulator(false)} className="text-slate-400 hover:text-slate-600">
                        &times;
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      目标日期
                      </label>
                      <input
                      type="date"
                      value={simDateStr}
                      onChange={(e) => setSimDateStr(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                  </div>
                  </div>
                  <div className="flex gap-2">
                  <button
                      onClick={resetSimulation}
                      className="flex-1 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
                  >
                      恢复实际
                  </button>
                  <button
                      onClick={applySimulation}
                      className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 transition-colors"
                  >
                      应用模拟
                  </button>
                  </div>
              </div>
            )}
          </section>
        </div>

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
                  <p className="text-xs font-medium">当前无正在进行的接箔作业</p>
                </div>
              ) : (
                updatedSplicingTasks.map((task: any) => (
                  <div key={task.id} className={cn(
                    "p-4 rounded-xl border flex flex-col gap-3 transition-all",
                    task.urgency === "critical"
                      ? "bg-red-50 border-red-200"
                      : task.urgency === "warning"
                        ? "bg-orange-50 border-orange-200"
                        : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider text-white",
                            task.line === "24"
                              ? "bg-blue-600"
                              : task.line === "25"
                                ? "bg-indigo-600"
                                : "bg-violet-600"
                          )}>
                          {task.line}#
                        </span>
                        <span className={cn(
                            "text-xs font-bold",
                            task.urgency === "critical"
                              ? "text-red-700"
                              : task.urgency === "warning"
                                ? "text-orange-700"
                                : "text-slate-700"
                          )}>
                          {task.displayStatus}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 font-bold">
                        自 {format(task.startTime, "HH:mm")} 开始
                      </span>
                    </div>
                    {/* Mini Progress bar */}
                    <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                      <div className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          task.urgency === "critical"
                            ? "bg-red-500"
                            : task.urgency === "warning"
                              ? "bg-orange-500"
                              : "bg-slate-600"
                        )}
                        style={{ width: `${Math.min(100, task.progress)}%` }}
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
              {LINES.map((line: any) => {
                const lastWash = lastWashes[line];
                let statusText = "暂无记录 (需冲洗)";
                let statusColor = "text-slate-500 bg-slate-100 border-slate-200";
                let elapsedMin = 0;

                if (lastWash) {
                  elapsedMin = differenceInMinutes(currentTime, lastWash);
                  if (elapsedMin < 90) {
                    statusText = `安全范围内 (${elapsedMin}m)`;
                    statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                  } else if (elapsedMin < 120) {
                    statusText = `准备冲洗 (${elapsedMin}m 预警)`;
                    statusColor = "text-orange-700 bg-orange-50 border-orange-200";
                  } else {
                    statusText = `急需冲洗 超时 (${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m)`;
                    statusColor = "text-red-700 bg-red-50 border-red-200 animate-pulse";
                  }
                }

                return (
                  <div key={line} className="flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                      <span className="text-sm font-black text-slate-700">{line}#</span>
                    </div>
                    <div className={cn(
                        "flex-1 relative border rounded-lg p-2.5 overflow-hidden flex justify-between items-center transition-colors",
                        statusColor
                      )}>
                      <span className="text-xs font-bold relative z-10">{statusText}</span>
                      <span className="text-[10px] font-mono opacity-60 font-bold relative z-10 truncate ml-2">
                        {lastWash ? `已上次于 ${format(lastWash, "HH:mm")}` : ""}
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
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">24#线合规长度</p>
              <p className="text-base sm:text-lg font-bold">400-550<span className="text-xs text-slate-500 ml-1">m</span></p>
            </div>
          </div>
          <div className="p-4 sm:p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">25#线合规长度</p>
              <p className="text-base sm:text-lg font-bold">300-800<span className="text-xs text-slate-500 ml-1">m</span></p>
            </div>
          </div>
          <div className="p-4 sm:p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center shrink-0">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">26#线合规长度</p>
              <p className="text-base sm:text-lg font-bold">400-550<span className="text-xs text-slate-500 ml-1">m</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
