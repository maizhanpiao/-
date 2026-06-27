import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import AdminDashboard from "./AdminDashboard";
import { SettingsPage } from "./SettingsPage";
import { useAuth } from "./AuthContext";
import { db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, addDoc, collection } from "firebase/firestore";
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
  Wrench,
  Scissors,
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
  Flag,
  MapPin,
  Calculator,
  Copy,
  Download,
  FileText,
  Share2,
  Upload,
  BellRing,
  Play,
  Gauge
} from "lucide-react";
import { cn } from "./lib/utils";
import DailyRecordPage from "./DailyRecordPage";

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
  const dataWindowMs = 20 * 60 * 60 * 1000;
  const recentOwnShift = getRelevantShifts(time)
    .filter((shift) => {
      const elapsed = time.getTime() - shift.start.getTime();
      return elapsed >= 0 && elapsed < dataWindowMs;
    })
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0];

  if (recentOwnShift) return new Date(recentOwnShift.start);

  return getCurrentShiftStart(time);
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
const ROSTER_SETTINGS_KEY = "maizhanpiao_roster_settings";

export type ShiftCycleDay = 0 | 1 | 2 | 3 | 4 | 5;

export interface RosterSettings {
  anchorDate: string;
  cycleDay: ShiftCycleDay;
}

const DEFAULT_ROSTER_SETTINGS: RosterSettings = {
  anchorDate: format(ANCHOR_DATE_DAY1_YI, "yyyy-MM-dd"),
  cycleDay: 0,
};

const SHIFT_CYCLE_LABELS = [
  "白班第1天",
  "白班第2天",
  "夜班第1天",
  "夜班第2天",
  "休息第1天",
  "休息第2天",
] as const;

function normalizeShiftCycleDay(value: unknown): ShiftCycleDay {
  const numberValue = Number(value);
  return [0, 1, 2, 3, 4, 5].includes(numberValue)
    ? (numberValue as ShiftCycleDay)
    : 0;
}

function loadRosterSettings(): RosterSettings {
  if (typeof window === "undefined") return DEFAULT_ROSTER_SETTINGS;
  try {
    const raw = localStorage.getItem(ROSTER_SETTINGS_KEY);
    if (!raw) return DEFAULT_ROSTER_SETTINGS;
    const parsed = JSON.parse(raw);
    const anchorDate =
      typeof parsed?.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.anchorDate)
        ? parsed.anchorDate
        : DEFAULT_ROSTER_SETTINGS.anchorDate;
    return {
      anchorDate,
      cycleDay: normalizeShiftCycleDay(parsed?.cycleDay),
    };
  } catch {
    return DEFAULT_ROSTER_SETTINGS;
  }
}

function saveRosterSettings(settings: RosterSettings) {
  localStorage.setItem(ROSTER_SETTINGS_KEY, JSON.stringify(settings));
}

function getRosterAnchorDate(settings = loadRosterSettings()) {
  const parsed = new Date(`${settings.anchorDate}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : ANCHOR_DATE_DAY1_YI;
}

function getShiftInfo(date: Date, settings = loadRosterSettings()) {
  const diffDays = differenceInDays(startOfDay(date), getRosterAnchorDate(settings));
  const cycleDay = ((diffDays + settings.cycleDay) % 6 + 6) % 6;

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

  return {
    type,
    name,
    timeStr,
    cycleDay,
    startHour,
    rosterLabel: SHIFT_CYCLE_LABELS[cycleDay],
  };
}

function getShiftOwnershipLabel(date: Date, settings?: RosterSettings) {
  const info = getShiftInfo(date, settings);
  if (info.type === "Day") return "我的白班";
  if (info.type === "Night") return "我的夜班";
  return "我的休息";
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
type LineId = string;

interface AssignedLine {
  id: string;
  speed: number;
}

interface AppAccount {
  username: string;
  password: string;
  role: "admin" | "user";
  lines: AssignedLine[];
}

interface LineMeterReading {
  value: number | null;
  speed: number | null;
  updatedAt: string | null;
}

const DEFAULT_LINE_ASSIGNMENTS: AssignedLine[] = [
  { id: "24", speed: 1.34 },
  { id: "25", speed: 1.21 },
  { id: "26", speed: 0.8 },
];

const LEGACY_DEFAULT_LINE_SPEEDS: Record<string, number> = {
  "24": 1.35,
  "25": 1.3,
  "26": 1.38,
};

function getDefaultLineSpeed(lineId: string, fallback = 1.3) {
  return DEFAULT_LINE_ASSIGNMENTS.find((line) => line.id === lineId)?.speed ?? fallback;
}

function shouldUseNewDefaultLineSpeed(lineId: string, speed: number) {
  const legacySpeed = LEGACY_DEFAULT_LINE_SPEEDS[lineId];
  return (
    !Number.isFinite(speed) ||
    speed <= 0 ||
    (legacySpeed !== undefined && Math.abs(speed - legacySpeed) < 0.0001)
  );
}

const ACCOUNT_STORAGE_KEY = "foil_app_accounts";
const SESSION_STORAGE_KEY = "foil_app_session_user";
const LOCAL_LINE_STATE_PREFIX = "foil_app_line_state";
const REALTIME_METER_PREFIX = "foil_app_realtime_meters";
const DAILY_RECORD_PREFIX = "daily_records_data";
const FULL_SNAPSHOT_PREFIX = "foil_app_full_snapshot";
const LOCAL_RETENTION_DAYS = 14;
const LOCAL_BACKUP_SUFFIX = "__backup";
const MIN_MANUAL_FORMED_LENGTH = 1;

function parsePositiveDecimalInput(value: string) {
  const normalized = value.trim().replace(/[，。．]/g, ".");
  const parsed = Number(normalized);
  return normalized !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readLocalStorageWithBackup(key: string) {
  const value = localStorage.getItem(key);
  if (value !== null) return value;
  const backup = localStorage.getItem(`${key}${LOCAL_BACKUP_SUFFIX}`);
  if (backup !== null) {
    localStorage.setItem(key, backup);
    return backup;
  }
  return null;
}

function writeLocalStorageWithBackup(key: string, value: string) {
  localStorage.setItem(key, value);
  localStorage.setItem(`${key}${LOCAL_BACKUP_SUFFIX}`, value);
}

function isAppLocalDataKey(key: string) {
  return (
    key === ACCOUNT_STORAGE_KEY ||
    key === SESSION_STORAGE_KEY ||
    key === "adminAuth" ||
    key.startsWith(`${LOCAL_LINE_STATE_PREFIX}:`) ||
    key.startsWith(`${REALTIME_METER_PREFIX}:`) ||
    key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`) ||
    key.startsWith(`${DAILY_RECORD_PREFIX}_`) ||
    key.endsWith(LOCAL_BACKUP_SUFFIX)
  );
}

function isPortableBackupDataKey(key: string) {
  return (
    isAppLocalDataKey(key) &&
    !key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`) &&
    !key.endsWith(LOCAL_BACKUP_SUFFIX)
  );
}

function normalizeLines(lines?: AssignedLine[]) {
  const source = lines && lines.length > 0 ? lines : DEFAULT_LINE_ASSIGNMENTS;
  const normalized = source.slice(0, 3).map((line, idx) => {
    const id = String(line.id || DEFAULT_LINE_ASSIGNMENTS[idx]?.id || `${idx + 1}`).trim();
    const rawSpeed = Number(line.speed);
    const fallbackSpeed = DEFAULT_LINE_ASSIGNMENTS[idx]?.speed || getDefaultLineSpeed(id);
    return {
      id,
      speed: shouldUseNewDefaultLineSpeed(id, rawSpeed) ? getDefaultLineSpeed(id, fallbackSpeed) : rawSpeed,
    };
  });
  while (normalized.length < 3) {
    const fallback = DEFAULT_LINE_ASSIGNMENTS[normalized.length];
    normalized.push({ id: fallback.id, speed: fallback.speed });
  }
  return normalized;
}

function normalizeAccounts(rawAccounts: AppAccount[]): AppAccount[] {
  const accounts: AppAccount[] = rawAccounts.map((account) => ({
    ...account,
    role: (account.role === "admin" ? "admin" : "user") as "admin" | "user",
    lines: normalizeLines(account.lines),
  }));
  const adminIndex = accounts.findIndex((account) => account.username === "admin");
  if (adminIndex >= 0) {
    accounts[adminIndex] = {
      ...accounts[adminIndex],
      password: "admin12345",
      role: "admin",
      lines: normalizeLines(accounts[adminIndex].lines),
    };
  } else {
    accounts.unshift({
      username: "admin",
      password: "admin12345",
      role: "admin",
      lines: normalizeLines(DEFAULT_LINE_ASSIGNMENTS),
    });
  }
  return accounts;
}

function loadAccounts() {
  try {
    const saved = readLocalStorageWithBackup(ACCOUNT_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    const accounts = normalizeAccounts(Array.isArray(parsed) ? parsed : []);
    writeLocalStorageWithBackup(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    return accounts;
  } catch {
    const accounts = normalizeAccounts([]);
    writeLocalStorageWithBackup(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    return accounts;
  }
}

function getDefaultLineConfig(speed: number): LinePlanConfig {
  return {
    cTotal: 0,
    cUsed: 0,
    cPrevUsed: 0,
    fProduced: 0,
    fPrevProduced: 0,
    batchNo: "",
    speed,
    speedSegments: [],
    futureRolls: [],
    rolls: [],
    completedRolls: [],
  };
}

function createLineConfigMap(lines: AssignedLine[]) {
  return normalizeLines(lines).reduce<Record<LineId, LinePlanConfig>>((acc, line) => {
    acc[line.id] = getDefaultLineConfig(line.speed);
    return acc;
  }, {});
}

function createLineDateMap<T>(lines: AssignedLine[], value: T) {
  return normalizeLines(lines).reduce<Record<LineId, T>>((acc, line) => {
    acc[line.id] = value;
    return acc;
  }, {});
}

function createLineSpeedInputMap(lines: AssignedLine[]) {
  return normalizeLines(lines).reduce<Record<LineId, string>>((acc, line) => {
    acc[line.id] = String(line.speed);
    return acc;
  }, {});
}

function createLineMeterMap(lines: AssignedLine[]) {
  return normalizeLines(lines).reduce<Record<LineId, LineMeterReading>>((acc, line) => {
    acc[line.id] = { value: null, speed: line.speed, updatedAt: null };
    return acc;
  }, {});
}

function normalizeLineMeterReadings(raw: unknown, lines: AssignedLine[]) {
  const source = raw && typeof raw === "object"
    ? raw as Record<string, { value?: unknown; speed?: unknown; updatedAt?: unknown }>
    : {};
  return normalizeLines(lines).reduce<Record<LineId, LineMeterReading>>((acc, line) => {
    const rawValue = source[line.id]?.value;
    const rawSpeed = source[line.id]?.speed;
    const rawUpdatedAt = source[line.id]?.updatedAt;
    const value = rawValue === null || rawValue === undefined || rawValue === ""
      ? null
      : Number(rawValue);
    const speed = rawSpeed === null || rawSpeed === undefined || rawSpeed === ""
      ? line.speed
      : Number(rawSpeed);
    acc[line.id] = {
      value: value !== null && Number.isFinite(value) && value >= 0 ? value : null,
      speed: speed !== null && Number.isFinite(speed) && speed >= 0
        ? shouldUseNewDefaultLineSpeed(line.id, speed)
          ? line.speed
          : speed
        : line.speed,
      updatedAt: typeof rawUpdatedAt === "string"
        ? rawUpdatedAt || null
        : null,
    };
    return acc;
  }, {});
}

function getRealtimeMeterStorageKey(username: string) {
  return `${REALTIME_METER_PREFIX}:${username}`;
}

function getLiveLineMeterValue(reading: LineMeterReading, now = new Date()) {
  if (reading.value === null) return null;
  if (reading.speed === null || !reading.updatedAt) return reading.value;
  const startedAt = new Date(reading.updatedAt);
  if (Number.isNaN(startedAt.getTime())) return reading.value;
  const elapsedMinutes = Math.max(0, (now.getTime() - startedAt.getTime()) / 60000);
  return reading.value + elapsedMinutes * reading.speed;
}

function createJointSlotMap(lines: AssignedLine[]) {
  return normalizeLines(lines).reduce<Record<LineId, JointSlotConfig[]>>((acc, line) => {
    acc[line.id] = normalizeJointSlots();
    return acc;
  }, {});
}

function createJointCalibrationMap(lines: AssignedLine[]) {
  return normalizeLines(lines).reduce<Record<LineId, JointCalibrationMark[]>>((acc, line) => {
    acc[line.id] = [];
    return acc;
  }, {});
}

function mergeJointSlotConfigs(
  prev: Record<LineId, JointSlotConfig[]>,
  lines: AssignedLine[],
) {
  return normalizeLines(lines).reduce<Record<LineId, JointSlotConfig[]>>((acc, line) => {
    acc[line.id] = normalizeJointSlots(prev?.[line.id]);
    return acc;
  }, {});
}

function mergeJointCalibrationMarks(
  prev: Record<LineId, JointCalibrationMark[]>,
  lines: AssignedLine[],
) {
  return normalizeLines(lines).reduce<Record<LineId, JointCalibrationMark[]>>((acc, line) => {
    const migratedMarks = (Array.isArray(prev?.[line.id]) ? prev[line.id] : []).map((mark) => {
      const furnaceMigratedMark = DEFAULT_FURNACE_STAGE_IDS.has(mark.slotId) && mark.uIndex === 0
        ? {
            ...mark,
            id: `${mark.slotId}:1`,
            uIndex: 1,
          }
        : mark;
      if ((furnaceMigratedMark.positionRevision || 0) < JOINT_POSITION_DATA_REVISION) {
        return {
          ...furnaceMigratedMark,
          position: shouldShiftLegacyJointPosition(
            furnaceMigratedMark.slotId,
            furnaceMigratedMark.uIndex,
          )
            ? Number((Number(furnaceMigratedMark.position) - 2).toFixed(2))
            : Number(furnaceMigratedMark.position),
          positionRevision: JOINT_POSITION_DATA_REVISION,
        };
      }
      return furnaceMigratedMark;
    });
    const deduplicated = new Map<string, JointCalibrationMark>();
    migratedMarks
      .sort((a, b) => new Date(a.markedAt).getTime() - new Date(b.markedAt).getTime())
      .forEach((mark) => deduplicated.set(`${mark.slotId}:${mark.uIndex}`, mark));
    acc[line.id] = [...deduplicated.values()];
    return acc;
  }, {});
}

function mergeLineConfigs(
  prev: Record<LineId, LinePlanConfig>,
  lines: AssignedLine[],
) {
  return normalizeLines(lines).reduce<Record<LineId, LinePlanConfig>>((acc, line) => {
    const previousSpeed = Number(prev[line.id]?.speed);
    acc[line.id] = prev[line.id]
      ? {
          ...prev[line.id],
          speed: shouldUseNewDefaultLineSpeed(line.id, previousSpeed) ? line.speed : previousSpeed,
          speedSegments: Array.isArray(prev[line.id].speedSegments) ? prev[line.id].speedSegments : [],
        }
      : getDefaultLineConfig(line.speed);
    return acc;
  }, {});
}

function getLocalLineStateKey(username: string, dateKey: string) {
  return `${LOCAL_LINE_STATE_PREFIX}:${username}:${dateKey}`;
}

function getDailyRecordStorageKey(username: string, dateKey: string) {
  return `${DAILY_RECORD_PREFIX}_${username}_${dateKey}`;
}

function pruneLocalStorageByDatePrefix(prefix: string, currentDateKey: string) {
  const currentTime = new Date(`${currentDateKey}T00:00:00`).getTime();
  if (!Number.isFinite(currentTime)) return;
  const maxAgeMs = (LOCAL_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000;

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const dateKey = key.slice(prefix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const savedTime = new Date(`${dateKey}T00:00:00`).getTime();
    if (Number.isFinite(savedTime) && currentTime - savedTime > maxAgeMs) {
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}${LOCAL_BACKUP_SUFFIX}`);
    }
  }
}

function reviveDateMap(
  raw: Record<LineId, string | Date | null> | undefined,
  lines: AssignedLine[],
) {
  const defaults = createLineDateMap<Date | null>(lines, null);
  if (!raw) return defaults;
  return normalizeLines(lines).reduce<Record<LineId, Date | null>>((acc, line) => {
    const value = raw[line.id];
    acc[line.id] = value ? new Date(value) : null;
    return acc;
  }, defaults);
}

function reviveSplicingTasks(raw: any): SplicingTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((task) => ({
    ...task,
    startTime: task.startTime ? new Date(task.startTime) : new Date(),
    rackTimerStartedAt: task.rackTimerStartedAt ? new Date(task.rackTimerStartedAt) : undefined,
    rackTimerDueAt: task.rackTimerDueAt ? new Date(task.rackTimerDueAt) : undefined,
  }));
}

function reviveLineStatePayload(
  parsed: any,
  lines: AssignedLine[],
) {
  return {
    lineConfigs: mergeLineConfigs(parsed?.lineConfigs || {}, lines),
    activeSplicing: reviveSplicingTasks(parsed?.activeSplicing),
    lastWashes: reviveDateMap(parsed?.lastWashes, lines),
    jointSlotConfigs: mergeJointSlotConfigs(parsed?.jointSlotConfigs || {}, lines),
    jointCalibrationMarks: mergeJointCalibrationMarks(parsed?.jointCalibrationMarks || {}, lines),
    punchRecords: parsed?.punchRecords && typeof parsed.punchRecords === "object"
      ? parsed.punchRecords
      : {},
  };
}

function reviveLocalLineState(
  raw: string | null,
  lines: AssignedLine[],
) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return reviveLineStatePayload(parsed, lines);
  } catch (error) {
    console.error("Failed to restore local line state", error);
    return null;
  }
}

interface JointSlotConfig {
  id: string;
  name: string;
  length: number;
  uCount: number;
}

interface JointCalibrationMark {
  id: string;
  slotId: string;
  uIndex: number;
  position: number;
  markedAt: string;
  jointId?: string;
  positionRevision?: number;
}

const JOINT_POSITION_DATA_REVISION = 2;

const DEFAULT_JOINT_STAGE_DEFINITIONS = [
  ["对接槽", 0],
  ["前处理槽", 5],
  ["T2槽", 1],
  ["1F槽", 2],
  ["T3槽", 1],
  ["2F槽", 2],
  ["kp1槽", 1],
  ["馈电1槽", 1],
  ["w1槽", 1],
  ["3F槽", 2],
  ["kp2槽", 1],
  ["馈电2槽", 1],
  ["w2槽", 1],
  ["4F槽", 3],
  ["5F槽", 4],
  ["kp3槽", 1],
  ["馈电3槽", 1],
  ["w3槽", 1, "joint-stage-17a"],
  ["6f1槽", 4],
  ["6F2槽", 4],
  ["w4槽", 1],
  ["磷酸1槽", 1],
  ["w5槽", 1],
  ["炉1", 2],
  ["6f3槽", 2],
  ["w7槽", 1],
  ["磷酸2槽", 3],
  ["w8槽", 2],
  ["6f4槽", 2],
  ["w9槽", 1],
  ["炉2", 2],
  ["6f5槽", 2],
  ["w10槽", 1],
  ["pa槽", 1],
  ["w11槽", 2],
  ["炉3", 2],
] as const;

const DEFAULT_FURNACE_STAGE_IDS = new Set([
  "joint-stage-23",
  "joint-stage-30",
  "joint-stage-35",
]);

function isFurnaceJointSlot(slot: Pick<JointSlotConfig, "id" | "name">) {
  return DEFAULT_FURNACE_STAGE_IDS.has(slot.id) || /^炉[123]$/.test(slot.name.trim());
}

function getJointPointLabel(slot: JointSlotConfig, uIndex: number) {
  if (isFurnaceJointSlot(slot)) {
    if (uIndex === 1) return "炉前";
    if (uIndex === 2) return "炉后";
  }
  return uIndex > 0 ? `U${uIndex}` : "阶段定位点";
}

function isInitialJointTrackingPoint(slot: JointSlotConfig, uIndex: number) {
  return slot.id === "joint-stage-02" && (uIndex === 4 || uIndex === 5);
}

function canMarkJointTrackingPoint(slot: JointSlotConfig, uIndex: number) {
  if (slot.id === "joint-stage-01") return false;
  if (slot.id === "joint-stage-02" && uIndex > 0 && uIndex < 4) return false;
  return true;
}

function shouldShiftLegacyJointPosition(slotId: string, uIndex: number) {
  const stageNumber = Number(slotId.match(/^joint-stage-(\d+)$/)?.[1]);
  if (!Number.isFinite(stageNumber)) return false;
  if (stageNumber === 2) return uIndex >= 5;
  if (stageNumber > 2 && stageNumber < 35) return true;
  return stageNumber === 35 && uIndex === 1;
}

function getDefaultJointStageWeight(name: string, uCount: number) {
  return /^炉[123]$/.test(name) ? 1 : Math.max(1, uCount);
}

const DEFAULT_JOINT_STAGE_WEIGHT = DEFAULT_JOINT_STAGE_DEFINITIONS.reduce(
  (sum, [name, uCount]) => sum + getDefaultJointStageWeight(name, uCount),
  0,
);

const DEFAULT_JOINT_SLOTS: JointSlotConfig[] = (() => {
  let legacyStageNumber = 0;
  return DEFAULT_JOINT_STAGE_DEFINITIONS.map(([name, uCount, customId]) => {
    if (!customId) legacyStageNumber += 1;
    return {
      id: customId || `joint-stage-${String(legacyStageNumber).padStart(2, "0")}`,
      name,
      length: Number(((240 * getDefaultJointStageWeight(name, uCount)) / DEFAULT_JOINT_STAGE_WEIGHT).toFixed(4)),
      uCount,
    };
  });
})();

// 生产线实测默认位置，车速 1.34 m/min；键格式为“阶段ID:U序号”，无 U 阶段使用 0。
const DEFAULT_JOINT_CALIBRATION_POSITIONS: Record<string, number> = {
  "joint-stage-02:5": 40.5,
  "joint-stage-04:2": 48.6,
  "joint-stage-05:1": 52.5,
  "joint-stage-06:1": 53.4,
  "joint-stage-06:2": 57.5,
  "joint-stage-07:1": 61.5,
  "joint-stage-08:1": 64.0,
  "joint-stage-09:1": 68.2,
  "joint-stage-10:1": 71.1,
  "joint-stage-10:2": 75.4,
  "joint-stage-11:1": 79.3,
  "joint-stage-12:1": 82.3,
  "joint-stage-13:1": 86.2,
  "joint-stage-14:1": 89.3,
  "joint-stage-14:2": 93.2,
  "joint-stage-14:3": 96.8,
  "joint-stage-15:1": 100.5,
  "joint-stage-25:1": 177.7,
  "joint-stage-26:1": 180.5,
  "joint-stage-26:2": 184.6,
  "joint-stage-26:3": 188.2,
  "joint-stage-27:1": 191.7,
  "joint-stage-27:2": 194.3,
  "joint-stage-28:1": 197.2,
  "joint-stage-28:2": 201.6,
  "joint-stage-31:1": 211.6,
  "joint-stage-31:2": 215.6,
  "joint-stage-32:1": 222.3,
  "joint-stage-33:1": 226.1,
  "joint-stage-34:1": 226.8,
  "joint-stage-34:2": 229.6,
  "joint-stage-35:1": 232.1,
  "joint-stage-35:2": 234.1,
};

const LEGACY_JOINT_SLOT_NAMES = [
  "入口预处理槽",
  "一段化成槽",
  "二段化成槽",
  "三段化成槽",
  "后处理槽",
];

function isLegacyDefaultJointSlots(raw?: JointSlotConfig[]) {
  return Boolean(
    Array.isArray(raw) &&
      raw.length === LEGACY_JOINT_SLOT_NAMES.length &&
      raw.every((slot, index) => slot.name === LEGACY_JOINT_SLOT_NAMES[index]),
  );
}

function applyJointSlotCorrections(source: JointSlotConfig[]) {
  const hasPlantStageLayout = source.some((slot) =>
    ["馈电3槽", "磷酸2槽", "6f1槽"].includes(String(slot.name || "")),
  );
  if (!hasPlantStageLayout) return source;

  const defaultByName = new Map(DEFAULT_JOINT_SLOTS.map((slot) => [slot.name, slot]));
  const corrected = source.map((slot) => {
    if (slot.name !== "磷酸2槽") return slot;
    const defaultSlot = defaultByName.get("磷酸2槽");
    return {
      ...slot,
      length: defaultSlot?.length ?? slot.length,
      uCount: 3,
    };
  });

  const hasW3Slot = corrected.some((slot) => slot.name === "w3槽");
  const feeder3Index = corrected.findIndex((slot) => slot.name === "馈电3槽");
  const defaultW3Slot = defaultByName.get("w3槽");
  if (!hasW3Slot && feeder3Index >= 0 && defaultW3Slot) {
    corrected.splice(feeder3Index + 1, 0, { ...defaultW3Slot });
  }

  return corrected;
}

function normalizeJointSlots(raw?: JointSlotConfig[]) {
  const source =
    Array.isArray(raw) && raw.length > 0 && !isLegacyDefaultJointSlots(raw)
      ? raw
      : DEFAULT_JOINT_SLOTS;
  return applyJointSlotCorrections(source).map((slot, index) => {
    const rawUCount = Number(slot.uCount);
    const fallbackUCount = DEFAULT_JOINT_SLOTS[index]?.uCount ?? 1;
    const normalizedUCount = Math.max(
      0,
      Math.round(Number.isFinite(rawUCount) ? rawUCount : fallbackUCount),
    );
    return {
      id: slot.id || `slot-${index + 1}`,
      name: String(slot.name || `槽${index + 1}`),
      length: Math.max(1, Number(slot.length) || DEFAULT_JOINT_SLOTS[index]?.length || 10),
      uCount: isFurnaceJointSlot(slot) ? Math.max(2, normalizedUCount) : normalizedUCount,
    };
  });
}

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

interface SpeedSegment {
  id: string;
  startTime: string;
  speed: number;
}

interface CompletedRoll {
  id: string;
  batchNo: string;
  corrosionBatchNo?: string;
  length: number;
  corrosionConsumed?: number;
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
  speedSegments?: SpeedSegment[];
  futureRolls?: FutureRoll[];
  completedRolls?: CompletedRoll[];
  rolls: PlannedRoll[];
}

interface SplicingTask {
  id: string;
  line: LineId;
  startTime: Date;
  status: "splicing" | "waiting_rack" | "passing_rack" | "done";
  rackTimerStartedAt?: Date;
  rackTimerDueAt?: Date;
  rackAlarmAcknowledged?: boolean;
  sourceRollId?: string;
}

interface WashLog {
  id: string;
  line: LineId;
  time: Date;
  duration: number;
}

function getCurrentCorrosionRemaining(config: LinePlanConfig) {
  return Math.max(0, Number(config.cTotal || 0) - Number(config.cUsed || 0));
}

function getQueuedCorrosionLength(config: LinePlanConfig) {
  return (config.futureRolls || []).reduce(
    (sum, roll) => sum + (Number(roll.length) || 0),
    0,
  );
}

function getPlannedCorrosionDemand(config: LinePlanConfig) {
  return getCurrentCorrosionRemaining(config) + getQueuedCorrosionLength(config);
}

function getFirstRollCarryIn(config: LinePlanConfig) {
  return getCurrentCorrosionRemaining(config) > 0 ? Number(config.fProduced || 0) : 0;
}

function getMinimumManualTarget(config: LinePlanConfig, index: number) {
  return index === 0
    ? Math.max(MIN_MANUAL_FORMED_LENGTH, getFirstRollCarryIn(config))
    : MIN_MANUAL_FORMED_LENGTH;
}

function getDefaultFormedLengthRange(lineId: LineId) {
  return lineId === "25"
    ? { min: 300, max: 800 }
    : { min: 400, max: 550 };
}

function getDefaultRangeStatus(lineId: LineId, length: number) {
  const range = getDefaultFormedLengthRange(lineId);
  if (length < range.min) return "low";
  if (length > range.max) return "high";
  return "ok";
}

function getRackCountdownMinutes(lineId: LineId) {
  return lineId === "26" ? 25 : 15;
}

const CURRENT_SHIFT_TIMELINE_PCT = 88;

function getTimelineVisualPct(
  minuteFromStart: number,
  _shiftMinutes: number,
  timelineMinutes: number,
  _currentShiftPct = CURRENT_SHIFT_TIMELINE_PCT,
) {
  return (minuteFromStart / Math.max(1, timelineMinutes)) * 100;
}

function getTimelineMinuteFromPct(
  pct: number,
  _shiftMinutes: number,
  timelineMinutes: number,
  _currentShiftPct = CURRENT_SHIFT_TIMELINE_PCT,
) {
  return (pct / 100) * timelineMinutes;
}

function updateRollTargetWithBorrow(
  config: LinePlanConfig,
  rollIndex: number,
  rawValue: number,
) {
  if (!Number.isFinite(rawValue) || !config.rolls[rollIndex]) return config;

  const newRolls = [...config.rolls];
  const current = newRolls[rollIndex];
  const currentMin = getMinimumManualTarget(config, rollIndex);
  let nextValue = Math.max(currentMin, rawValue);

  let borrowIndex = -1;
  if (rollIndex < newRolls.length - 1) {
    borrowIndex = rollIndex + 1;
  } else if (rollIndex > 0) {
    borrowIndex = rollIndex - 1;
  }

  if (borrowIndex >= 0) {
    const borrowMin = getMinimumManualTarget(config, borrowIndex);
    const pairTotal =
      Number(current.targetFormedLength || 0) +
      Number(newRolls[borrowIndex].targetFormedLength || 0);
    const maxValueKeepingBorrow = pairTotal - borrowMin;

    if (maxValueKeepingBorrow >= currentMin) {
      nextValue = Math.min(nextValue, maxValueKeepingBorrow);
      const delta = nextValue - Number(current.targetFormedLength || 0);
      newRolls[rollIndex] = {
        ...newRolls[rollIndex],
        targetFormedLength: Number(nextValue.toFixed(1)),
      };
      newRolls[borrowIndex] = {
        ...newRolls[borrowIndex],
        targetFormedLength: Number(
          (Number(newRolls[borrowIndex].targetFormedLength || 0) - delta).toFixed(1),
        ),
      };
      return { ...config, rolls: newRolls };
    }
  }

  newRolls[rollIndex] = {
    ...newRolls[rollIndex],
    targetFormedLength: Number(nextValue.toFixed(1)),
  };
  return { ...config, rolls: newRolls };
}

function getRollCorrosionConsumed(
  roll: PlannedRoll,
  index: number,
  config: LinePlanConfig,
) {
  const carryIn = index === 0 ? getFirstRollCarryIn(config) : 0;
  return Math.max(0, Number(roll.targetFormedLength || 0) - carryIn);
}

function getCompletedRollCorrosionConsumed(roll: CompletedRoll) {
  return Number(roll.corrosionConsumed ?? roll.length) || 0;
}

function getManualCompletedRolls(rolls: CompletedRoll[] = []) {
  return rolls.filter((roll) => roll.isManual);
}

function getManualUnloadedLength(rolls: CompletedRoll[] = []) {
  const manualRolls = getManualCompletedRolls(rolls);
  return manualRolls
    .slice(0, -1)
    .reduce((sum, roll) => sum + (Number(roll.length) || 0), 0);
}

function getManualInProgressLength(rolls: CompletedRoll[] = []) {
  const manualRolls = getManualCompletedRolls(rolls);
  const lastRoll = manualRolls[manualRolls.length - 1];
  return lastRoll ? Number(lastRoll.length) || 0 : 0;
}

function getManualCarryInLength(rolls: CompletedRoll[] = []) {
  return getManualCompletedRolls(rolls).reduce(
    (sum, roll) => sum + (Number(roll.length) || 0),
    0,
  );
}

function getUnloadedCompletedRolls(rolls: CompletedRoll[] = []) {
  const manualRolls = getManualCompletedRolls(rolls);
  const inProgressManualId = manualRolls[manualRolls.length - 1]?.id;
  return rolls.filter((roll) => !(roll.isManual && roll.id === inProgressManualId));
}

function applyCompletedRollAccounting(
  config: LinePlanConfig,
  completedRolls: CompletedRoll[],
) {
  const manualCarryIn = getManualCarryInLength(completedRolls);
  const inProgressLength = getManualInProgressLength(completedRolls);
  const producedThisShift = completedRolls
    .filter((roll) => !roll.isManual)
    .reduce((sum, roll) => sum + getCompletedRollCorrosionConsumed(roll), 0);

  return {
    ...config,
    completedRolls,
    cPrevUsed: manualCarryIn,
    cUsed: manualCarryIn + producedThisShift,
    fPrevProduced: inProgressLength,
    fProduced: inProgressLength,
  };
}

function parseSegmentTimeOnShift(startTime: string, shiftStart: Date) {
  const [hoursRaw, minutesRaw] = String(startTime || "").split(":").map(Number);
  const hours = Number.isFinite(hoursRaw) ? hoursRaw : shiftStart.getHours();
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : shiftStart.getMinutes();
  const result = new Date(shiftStart);
  result.setHours(hours, minutes, 0, 0);
  if (result.getTime() < shiftStart.getTime()) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function getSpeedSchedule(config: LinePlanConfig, shiftStart: Date) {
  const baseSpeed = Number(config.speed) > 0 ? Number(config.speed) : 1;
  const base = {
    id: "base",
    startTime: new Date(shiftStart),
    speed: baseSpeed,
  };
  const segments = (config.speedSegments || [])
    .filter((segment) => Number(segment.speed) > 0 && /^\d{2}:\d{2}$/.test(segment.startTime))
    .map((segment) => ({
      id: segment.id,
      startTime: parseSegmentTimeOnShift(segment.startTime, shiftStart),
      speed: Number(segment.speed),
    }))
    .filter((segment) => segment.startTime.getTime() >= shiftStart.getTime());

  return [base, ...segments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

function getSpeedAtTime(config: LinePlanConfig, time: Date, shiftStart = getCurrentShiftStart(time)) {
  const schedule = getSpeedSchedule(config, shiftStart);
  let current = schedule[0]?.speed || Number(config.speed) || 1;
  for (const segment of schedule) {
    if (segment.startTime.getTime() <= time.getTime()) {
      current = segment.speed;
    } else {
      break;
    }
  }
  return current;
}

function addDistanceWithSpeed(
  startTime: Date,
  distance: number,
  config: LinePlanConfig,
  shiftStart = getCurrentShiftStart(startTime),
) {
  if (!Number.isFinite(distance) || distance <= 0) return new Date(startTime);
  let cursor = new Date(startTime);
  let remaining = distance;
  const schedule = getSpeedSchedule(config, shiftStart);

  for (let guard = 0; guard < 100; guard += 1) {
    const speed = Math.max(0.01, getSpeedAtTime(config, cursor, shiftStart));
    const nextSegment = schedule.find((segment) => segment.startTime.getTime() > cursor.getTime());
    if (!nextSegment) {
      return addMinutes(cursor, remaining / speed);
    }
    const minutesToNext = Math.max(0, (nextSegment.startTime.getTime() - cursor.getTime()) / 60000);
    const distanceToNext = minutesToNext * speed;
    if (remaining <= distanceToNext) {
      return addMinutes(cursor, remaining / speed);
    }
    remaining -= distanceToNext;
    cursor = new Date(nextSegment.startTime);
  }
  return addMinutes(cursor, remaining / Math.max(0.01, Number(config.speed) || 1));
}

function distanceBetweenWithSpeed(
  startTime: Date,
  endTime: Date,
  config: LinePlanConfig,
  shiftStart = getCurrentShiftStart(startTime),
) {
  if (endTime.getTime() <= startTime.getTime()) return 0;
  let cursor = new Date(startTime);
  let distance = 0;
  const schedule = getSpeedSchedule(config, shiftStart);

  for (let guard = 0; guard < 100 && cursor.getTime() < endTime.getTime(); guard += 1) {
    const speed = Math.max(0.01, getSpeedAtTime(config, cursor, shiftStart));
    const nextSegment = schedule.find((segment) => segment.startTime.getTime() > cursor.getTime());
    const stop = nextSegment && nextSegment.startTime.getTime() < endTime.getTime()
      ? nextSegment.startTime
      : endTime;
    distance += ((stop.getTime() - cursor.getTime()) / 60000) * speed;
    cursor = new Date(stop);
  }
  return distance;
}

function getPlannedLiveMeterValue(
  config: LinePlanConfig,
  planStart: Date,
  now = new Date(),
) {
  const carryIn = getFirstRollCarryIn(config);
  const hasPlanningData =
    config.rolls.length > 0 || carryIn > 0 || getPlannedCorrosionDemand(config) > 0;
  if (!hasPlanningData) return null;
  if (now.getTime() <= planStart.getTime()) return carryIn;

  let distance = distanceBetweenWithSpeed(planStart, now, config, planStart);
  if (config.rolls.length === 0) return carryIn + distance;

  for (let index = 0; index < config.rolls.length; index += 1) {
    const rollDistance = Math.max(
      0,
      getRollCorrosionConsumed(config.rolls[index], index, config),
    );
    if (distance < rollDistance) {
      return (index === 0 ? carryIn : 0) + distance;
    }
    distance = Math.max(0, distance - rollDistance);
    if (distance < 0.0001) return 0;
  }

  return distance;
}

function subtractDistanceWithSpeed(
  endTime: Date,
  distance: number,
  config: LinePlanConfig,
  shiftStart = getCurrentShiftStart(endTime),
) {
  if (!Number.isFinite(distance) || distance <= 0) return new Date(endTime);
  let cursor = new Date(endTime);
  let remaining = distance;
  const schedule = getSpeedSchedule(config, shiftStart);

  for (let guard = 0; guard < 100; guard += 1) {
    const speed = Math.max(0.01, getSpeedAtTime(config, addMinutes(cursor, -0.01), shiftStart));
    const previousSegment = [...schedule]
      .reverse()
      .find((segment) => segment.startTime.getTime() < cursor.getTime());
    const stop = previousSegment && previousSegment.startTime.getTime() > shiftStart.getTime()
      ? previousSegment.startTime
      : shiftStart;
    const minutesToStop = Math.max(0, (cursor.getTime() - stop.getTime()) / 60000);
    const distanceToStop = minutesToStop * speed;
    if (remaining <= distanceToStop || stop.getTime() <= shiftStart.getTime()) {
      return addMinutes(cursor, -(remaining / speed));
    }
    remaining -= distanceToStop;
    cursor = new Date(stop);
  }
  return addMinutes(cursor, -(remaining / Math.max(0.01, Number(config.speed) || 1)));
}

function addSignedDistanceWithSpeed(
  startTime: Date,
  distance: number,
  config: LinePlanConfig,
  shiftStart = getCurrentShiftStart(startTime),
) {
  if (!Number.isFinite(distance) || distance === 0) return new Date(startTime);
  return distance > 0
    ? addDistanceWithSpeed(startTime, distance, config, shiftStart)
    : subtractDistanceWithSpeed(startTime, Math.abs(distance), config, shiftStart);
}

function TaskCountdownCard({
  currentTime,
  nowTime,
  lineIds,
  lineConfigs,
  activeSplicing,
  onStartRackCountdown,
  onAcknowledgeRackAlarm,
  onConfirmJointPrepComplete,
}: {
  currentTime: Date;
  nowTime: Date;
  lineIds: LineId[];
  lineConfigs: Record<LineId, LinePlanConfig>;
  activeSplicing: SplicingTask[];
  onStartRackCountdown: (taskId: string) => void;
  onAcknowledgeRackAlarm: (taskId: string) => void;
  onConfirmJointPrepComplete: (lineId: LineId, sourceRollId: string) => void;
}) {
  const formatCountdown = (target: Date) => {
    const diffMs = target.getTime() - nowTime.getTime();
    const isOverdue = diffMs <= 0;
    const absSeconds = Math.abs(Math.ceil(diffMs / 1000));
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    return `${isOverdue ? "已到时 " : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const lineTasks = activeSplicing.filter((task) => lineIds.includes(task.line));
  const activeRackTask = lineTasks
    .filter((task) => task.rackTimerDueAt && !task.rackAlarmAcknowledged)
    .sort((a, b) => new Date(a.rackTimerDueAt!).getTime() - new Date(b.rackTimerDueAt!).getTime())[0];

  const pendingRackTask = lineTasks
    .filter((task) => !task.rackTimerDueAt && !task.rackAlarmAcknowledged && task.status !== "done")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];

  let plannedTask: {
    id: string;
    line: LineId;
    label: string;
    time: Date;
    tone: "blue" | "orange";
    type: "joint_prep" | "unroll";
    sourceRollId?: string;
  } | null = null;

  if (!activeRackTask && !pendingRackTask) {
    const candidates: NonNullable<typeof plannedTask>[] = [];
    lineIds.forEach((lineId) => {
      const config = lineConfigs[lineId];
      let accC = 0;
      config.rolls.forEach((roll, index) => {
        const consumed = getRollCorrosionConsumed(roll, index, config);
        accC += consumed;
        const endTime = addDistanceWithSpeed(currentTime, accC, config, currentTime);
        if (roll.isJoint) {
          const jointPrepHandled = activeSplicing.some(
            (task) => task.line === lineId && task.sourceRollId === roll.id,
          );
          const frontStartTime = addSignedDistanceWithSpeed(currentTime, accC - 240, config, currentTime);
          if (!jointPrepHandled && frontStartTime.getTime() >= nowTime.getTime()) {
            candidates.push({
              id: `joint-${lineId}-${roll.id}`,
              line: lineId,
              label: "接箔前端处理",
              time: frontStartTime,
              tone: "orange",
              type: "joint_prep",
              sourceRollId: roll.id,
            });
          }
        }
        if (endTime.getTime() >= nowTime.getTime()) {
          candidates.push({
            id: `unroll-${lineId}-${roll.id}`,
            line: lineId,
            label: roll.isJoint ? "接头出线分卷" : "分卷卸卷",
            time: endTime,
            tone: roll.isJoint ? "orange" : "blue",
            type: "unroll",
          });
        }
      });
    });
    plannedTask = candidates.sort((a, b) => a.time.getTime() - b.time.getTime())[0] || null;
  }

  if (activeRackTask) {
    const dueAt = new Date(activeRackTask.rackTimerDueAt!);
    const isRinging = nowTime.getTime() >= dueAt.getTime();
    return (
      <section
        className={cn(
          "rounded-2xl border p-4 shadow-sm",
          isRinging
            ? "bg-red-600 text-white border-red-700 animate-pulse shadow-red-500/30"
            : "bg-amber-50 text-amber-950 border-amber-200",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isRinging ? "bg-white/20" : "bg-amber-100")}>
              <BellRing size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black opacity-80">最近任务 · {activeRackTask.line}# 线</div>
              <div className="font-black text-lg leading-tight">过架子</div>
              <div className="text-xs font-bold opacity-75">目标时间 {format(dueAt, "HH:mm")}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="font-mono text-3xl font-black tracking-tight">
              {formatCountdown(dueAt)}
            </div>
            <button
              type="button"
              onClick={() => onAcknowledgeRackAlarm(activeRackTask.id)}
              className={cn(
                "px-4 py-2 rounded-lg font-black text-xs shadow",
                isRinging
                  ? "bg-white text-red-700"
                  : "bg-amber-600 text-white hover:bg-amber-500",
              )}
            >
              {isRinging ? "已处理，停止闹钟" : "已准备好，取消提醒"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (pendingRackTask) {
    return (
      <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <Clock size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-orange-700/80">最近任务 · {pendingRackTask.line}# 线</div>
              <div className="font-black text-lg text-orange-950 leading-tight">过架子倒计时待开始</div>
              <div className="text-xs font-bold text-orange-700/70">
                实际接箔完成后点击，开始 {getRackCountdownMinutes(pendingRackTask.line)} 分钟计时
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onStartRackCountdown(pendingRackTask.id)}
            className="shrink-0 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-xs shadow flex items-center gap-2"
          >
            <Play size={15} fill="currentColor" />
            开始计时
          </button>
        </div>
      </section>
    );
  }

  if (!plannedTask) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-black text-slate-700">最近任务</div>
        <div className="text-xs font-bold text-slate-400 mt-1">当前没有待处理的关键任务</div>
      </section>
    );
  }

  return (
    <section className={cn(
      "rounded-2xl border p-4 shadow-sm",
      plannedTask.tone === "orange"
        ? "bg-orange-50 border-orange-200 text-orange-950"
        : "bg-blue-50 border-blue-200 text-blue-950",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", plannedTask.tone === "orange" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700")}>
            <Clock size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black opacity-75">最近任务 · {plannedTask.line}# 线</div>
            <div className="font-black text-lg leading-tight">{plannedTask.label}</div>
            <div className="text-xs font-bold opacity-70">预计 {format(plannedTask.time, "HH:mm")}</div>
          </div>
        </div>
        <div className="font-mono text-3xl font-black tracking-tight shrink-0">
          {formatCountdown(plannedTask.time)}
        </div>
      </div>
      {plannedTask.type === "joint_prep" && (
        <button
          type="button"
          onClick={() => onConfirmJointPrepComplete(plannedTask.line, plannedTask.sourceRollId || plannedTask.id)}
          className="mt-3 w-full rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm py-3 shadow flex items-center justify-center gap-2"
        >
          <CheckSquare size={17} />
          已处理好，开始过架子{getRackCountdownMinutes(plannedTask.line)}分钟倒计时
        </button>
      )}
    </section>
  );
}

function CombinedPlanTimeline({
  lineConfigs,
  updateConfig,
  currentTime,
  nowTime,
  rosterSettings,
  lines,
  activeSplicing,
  onStartRackCountdown,
  onAcknowledgeRackAlarm,
  onConfirmJointPrepComplete,
}: {
  lineConfigs: Record<LineId, LinePlanConfig>;
  updateConfig: (id: LineId, c: LinePlanConfig) => void;
  currentTime: Date;
  nowTime: Date;
  rosterSettings: RosterSettings;
  lines: LineId[];
  activeSplicing: SplicingTask[];
  onStartRackCountdown: (taskId: string) => void;
  onAcknowledgeRackAlarm: (taskId: string) => void;
  onConfirmJointPrepComplete: (lineId: LineId, sourceRollId: string) => void;
}) {
  // Show the current shift plus the next shift so planned cuts can be moved past handoff.
  const shiftStart = getCurrentShiftStart(currentTime);
  const shiftEnd = getCurrentShiftEnd(currentTime);
  const shiftMinutes = differenceInMinutes(shiftEnd, shiftStart); // Typically 720
  const furthestPlanMinutes = lines.reduce((maxMinutesSoFar, lineId) => {
    const config = lineConfigs[lineId];
    const plannedEndLength = (config.rolls || []).reduce(
      (sum, roll) => sum + Number(roll.targetFormedLength || 0),
      0,
    );
    const plannedDistance = Math.max(0, plannedEndLength - getFirstRollCarryIn(config));
    const plannedEndTime = addDistanceWithSpeed(
      currentTime,
      plannedDistance,
      config,
      shiftStart,
    );
    return Math.max(
      maxMinutesSoFar,
      differenceInMinutes(plannedEndTime, shiftStart),
    );
  }, 0);
  const timelineMinutes =
    Math.ceil(
      Math.max(shiftMinutes * 2, furthestPlanMinutes + shiftMinutes * 0.25) /
        shiftMinutes,
    ) * shiftMinutes;
  const shiftBoundaryPct = getTimelineVisualPct(
    shiftMinutes,
    shiftMinutes,
    timelineMinutes,
  );
  const timelineWidthPct =
    (CURRENT_SHIFT_TIMELINE_PCT / Math.max(1, shiftBoundaryPct)) * 100;
  const realNowMinutesFromShiftStart = differenceInMinutes(nowTime, shiftStart);
  const realNowPct = Math.max(
    0,
    Math.min(
      100,
      getTimelineVisualPct(
        realNowMinutesFromShiftStart,
        shiftMinutes,
        timelineMinutes,
      ),
    ),
  );
  const shiftBoundaryTicks = Array.from(
    new Set([
      ...Array.from(
        { length: Math.floor(timelineMinutes / shiftMinutes) + 1 },
        (_, index) => index * shiftMinutes,
      ).filter((minuteFromStart) => minuteFromStart <= timelineMinutes),
      timelineMinutes,
    ]),
  ).sort((a, b) => a - b);
  const shiftSpanTicks = Array.from(
    { length: Math.ceil(timelineMinutes / shiftMinutes) },
    (_, index) => index * shiftMinutes,
  ).filter((minuteFromStart) => minuteFromStart < timelineMinutes);

  return (
    <div className="mb-6 flex flex-col gap-6 w-full max-w-full">
      {/* The Unified Timeline Chart */}
      <div className="-mx-4 sm:mx-0 w-[calc(100%+32px)] sm:w-full overflow-x-auto hide-scrollbar sm:rounded-xl border-y sm:border border-slate-200 bg-slate-50 sm:shadow-inner relative z-0">
        <div
          className="relative w-full text-slate-700 py-4 sm:py-6 pl-2 pr-2 sm:px-0"
          style={{ width: `${timelineWidthPct}%`, minWidth: "680px" }}
        >
          
          <div className="absolute top-0 bottom-0 left-4 right-4 pointer-events-none z-0">
            {/* Shift boundary ticks */}
            <div className="absolute inset-0 border-l-2 border-slate-300 border-dashed">
              {shiftBoundaryTicks.slice(1, -1).map((minuteFromStart) => (
                <div
                  key={minuteFromStart}
                  className="absolute top-0 bottom-0 border-l border-slate-200 border-dashed"
                  style={{
                    left: `${getTimelineVisualPct(
                      minuteFromStart,
                      shiftMinutes,
                      timelineMinutes,
                    )}%`,
                  }}
                ></div>
              ))}
            </div>

            {/* Current Time Line */}
            <div
              className="absolute top-8 bottom-0 border-l-2 border-blue-400 border-dashed z-0"
              style={{ left: `${realNowPct}%` }}
            ></div>

            {/* Shift handoff boundary */}
            <div
              className="absolute top-8 bottom-0 border-l-2 border-orange-400 z-0"
              style={{ left: `${shiftBoundaryPct}%` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                下班 / 下一班
              </div>
            </div>
            
            {/* Labels */}
            <div className="absolute top-0 left-0 right-0 h-7 text-slate-400 font-bold flex items-start">
              {shiftSpanTicks.map((minuteFromStart) => {
                const segmentStart = addMinutes(shiftStart, minuteFromStart);
                const segmentEnd = addMinutes(segmentStart, shiftMinutes);
                const centerPct =
                  getTimelineVisualPct(
                    minuteFromStart + shiftMinutes / 2,
                    shiftMinutes,
                    timelineMinutes,
                  ) / 100;
                return (
                  <div
                    key={`span-${minuteFromStart}`}
                    className="absolute top-0 z-10 flex -translate-x-1/2 flex-col items-center rounded-md bg-slate-50/90 px-1.5 py-0.5 text-center leading-none shadow-[0_0_0_1px_rgba(203,213,225,0.55)]"
                    style={{ left: `${centerPct * 100}%` }}
                  >
                    <span className="whitespace-nowrap text-[9px] font-black text-slate-500 sm:text-[10px]">
                      {format(segmentStart, "MM-dd")}
                      <span className="ml-1 text-blue-600">
                        {getShiftOwnershipLabel(segmentStart, rosterSettings)}
                      </span>
                    </span>
                    <span className="mt-0.5 whitespace-nowrap text-[8px] font-bold text-slate-400 sm:text-[9px]">
                      {format(segmentStart, "HH:mm")}-{format(segmentEnd, "HH:mm")}
                    </span>
                  </div>
                );
              })}

              {shiftBoundaryTicks.map((minuteFromStart, index) => {
                const pct =
                  getTimelineVisualPct(
                    minuteFromStart,
                    shiftMinutes,
                    timelineMinutes,
                  ) / 100;
                let transform = "-translate-x-1/2";
                if (minuteFromStart === 0) transform = "";
                if (index === shiftBoundaryTicks.length - 1) transform = "-translate-x-full";

                const tickTime = addMinutes(shiftStart, minuteFromStart);

                return (
                  <div
                    key={minuteFromStart}
                    className={`absolute top-0 z-0 flex flex-col leading-none ${transform}`}
                    style={{ left: `${pct * 100}%` }}
                  >
                    <span className="text-[8px] text-slate-300 sm:text-[9px]">
                      {format(tickTime, "MM-dd")}
                    </span>
                    <span className="mt-0.5 text-[9px] text-slate-400 sm:text-[10px]">
                      {format(tickTime, "HH:mm")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-7 space-y-2 relative z-10 w-full px-4">

        {lines.map((lineId) => {
          const config = lineConfigs[lineId];
          const totalToForm = getFirstRollCarryIn(config) + getPlannedCorrosionDemand(config);

            const cumSum: number[] = [];
            let acc = 0;
            config.rolls.forEach((r) => {
              acc += r.targetFormedLength;
              cumSum.push(acc);
            });

            return (
              <div key={lineId} className="flex flex-col group relative w-full mb-12 sm:mb-14">
                <div className="flex items-center gap-1.5 mb-1.5 sticky left-0 z-20 w-fit mix-blend-multiply">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="font-black text-slate-800 text-xs sm:text-sm">{lineId}# 线</span>
                </div>
                <div className="relative rounded-lg border border-slate-200 shadow-sm bg-white">
                  <DraggableTimelineLine
                    lineId={lineId}
                    config={config}
                    cumSum={cumSum}
                    totalToForm={totalToForm}
                    updateConfig={updateConfig}
                    currentTime={currentTime}
                    shiftStart={shiftStart}
                    maxMinutes={timelineMinutes}
                    shiftMinutes={shiftMinutes}
                    currentShiftPct={CURRENT_SHIFT_TIMELINE_PCT}
                  />
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
              <TaskCountdownCard
                currentTime={currentTime}
                nowTime={nowTime}
                lineIds={[lineId]}
                lineConfigs={lineConfigs}
                activeSplicing={activeSplicing}
                onStartRackCountdown={onStartRackCountdown}
                onAcknowledgeRackAlarm={onAcknowledgeRackAlarm}
                onConfirmJointPrepComplete={onConfirmJointPrepComplete}
              />
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
      const dragWidth = rect.width * 2;
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(dragWidth, x));
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
  maxMinutes,
  shiftMinutes,
  currentShiftPct = CURRENT_SHIFT_TIMELINE_PCT,
}: any) {
  const barRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editingRollIdx, setEditingRollIdx] = useState<number | null>(null);
  const [editorAnchorPct, setEditorAnchorPct] = useState(50);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editTimeValue, setEditTimeValue] = useState("");
  const [editorViewportAnchor, setEditorViewportAnchor] = useState({ left: 0, top: 0 });
  const [rangeFlashByIdx, setRangeFlashByIdx] = useState<Record<number, number>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const lastRangeStatusRef = useRef<Record<number, string>>({});

  const currMinutesFromStart = differenceInMinutes(currentTime, shiftStart);
  const minuteToPct = (minuteFromStart: number) =>
    getTimelineVisualPct(
      minuteFromStart,
      shiftMinutes,
      maxMinutes,
      currentShiftPct,
    );
  const pctToMinute = (pct: number) =>
    getTimelineMinuteFromPct(
      pct,
      shiftMinutes,
      maxMinutes,
      currentShiftPct,
    );
  const getRollEndTime = (rollIdx: number) => {
    const cumulative = Number(cumSum[rollIdx] || 0);
    return addDistanceWithSpeed(
      currentTime,
      cumulative - getFirstRollCarryIn(config),
      config,
      shiftStart,
    );
  };

  const updateEditorViewportAnchor = (anchorPct = editorAnchorPct) => {
    if (!barRef.current || typeof window === "undefined") return;
    const rect = barRef.current.getBoundingClientRect();
    const panelHalfWidth = Math.min(160, Math.max(120, (window.innerWidth - 32) / 2));
    const left = Math.min(
      window.innerWidth - panelHalfWidth - 8,
      Math.max(panelHalfWidth + 8, rect.left + (rect.width * anchorPct) / 100),
    );
    setEditorViewportAnchor({
      left,
      top: Math.max(8, rect.bottom + 12),
    });
  };

  const selectRollEditor = (rollIdx: number, anchorPct = 50) => {
    const roll = config.rolls[rollIdx];
    if (!roll) return;
    const nextAnchorPct = Math.max(4, Math.min(96, anchorPct));
    setEditingRollIdx(rollIdx);
    setEditorAnchorPct(nextAnchorPct);
    updateEditorViewportAnchor(nextAnchorPct);
    setDeleteConfirmIdx(null);
    setEditValue(Number(roll.targetFormedLength || 0).toFixed(1));
    setEditTimeValue(format(getRollEndTime(rollIdx), "HH:mm"));
  };

  const parseTimelineTimeInput = (value: string) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    const result = new Date(shiftStart);
    result.setHours(hours, minutes, 0, 0);
    if (result.getTime() < shiftStart.getTime()) {
      result.setDate(result.getDate() + 1);
    }
    const timelineEnd = addMinutes(shiftStart, maxMinutes);
    if (result.getTime() > timelineEnd.getTime()) return timelineEnd;
    return result;
  };

  const commitLengthEdit = (rollIdx = editingRollIdx) => {
    if (rollIdx === null || !config.rolls[rollIdx]) return;
    const val = parsePositiveDecimalInput(editValue);
    if (val === null) {
      setEditValue(Number(config.rolls[rollIdx].targetFormedLength || 0).toFixed(1));
      return;
    }
    checkRangeBoundaryReminder(rollIdx, val);
    const nextConfig = updateRollTargetWithBorrow(config, rollIdx, val);
    const nextLength = Number(nextConfig.rolls[rollIdx]?.targetFormedLength || val);
    const prevLength = rollIdx === 0 ? 0 : Number(cumSum[rollIdx - 1] || 0);
    const nextEndTime = addDistanceWithSpeed(
      currentTime,
      prevLength + nextLength - getFirstRollCarryIn(config),
      nextConfig,
      shiftStart,
    );
    setEditValue(nextLength.toFixed(1));
    setEditTimeValue(format(nextEndTime, "HH:mm"));
    updateConfig(lineId, nextConfig);
  };

  const commitTimeEdit = (rollIdx = editingRollIdx) => {
    if (rollIdx === null || !config.rolls[rollIdx]) return;
    const targetTime = parseTimelineTimeInput(editTimeValue);
    if (!targetTime) {
      setEditTimeValue(format(getRollEndTime(rollIdx), "HH:mm"));
      return;
    }
    const firstCarryIn = getFirstRollCarryIn(config);
    const prevLength = rollIdx === 0 ? 0 : Number(cumSum[rollIdx - 1] || 0);
    const targetCumulative =
      distanceBetweenWithSpeed(currentTime, targetTime, config, shiftStart) +
      firstCarryIn;
    const nextTargetLength = targetCumulative - prevLength;
    checkRangeBoundaryReminder(rollIdx, nextTargetLength);
    const nextConfig = updateRollTargetWithBorrow(config, rollIdx, nextTargetLength);
    const nextLength = Number(nextConfig.rolls[rollIdx]?.targetFormedLength || 0);
    setEditValue(nextLength.toFixed(1));
    setEditTimeValue(format(targetTime, "HH:mm"));
    updateConfig(lineId, nextConfig);
  };

  const addRollAfter = (rollIdx: number) => {
    const roll = config.rolls[rollIdx];
    if (!roll) return;
    const newRolls = [...config.rolls];
    const half = Number(newRolls[rollIdx].targetFormedLength || 0) / 2;
    const wasJoint = newRolls[rollIdx].isJoint;

    newRolls[rollIdx] = {
      ...newRolls[rollIdx],
      targetFormedLength: half,
      isJoint: false,
    };

    newRolls.splice(rollIdx + 1, 0, {
      id: Math.random().toString(),
      targetFormedLength: half,
      isJoint: wasJoint,
      batchNumber: newRolls[rollIdx].batchNumber,
      formedBatchNo: newRolls[rollIdx].formedBatchNo,
    });
    const nextConfig = { ...config, rolls: newRolls };
    const prevLength = rollIdx === 0 ? 0 : Number(cumSum[rollIdx - 1] || 0);
    const nextEndTime = addDistanceWithSpeed(
      currentTime,
      prevLength + half - getFirstRollCarryIn(config),
      nextConfig,
      shiftStart,
    );
    updateConfig(lineId, nextConfig);
    setEditingRollIdx(rollIdx);
    setEditValue(half.toFixed(1));
    setEditTimeValue(format(nextEndTime, "HH:mm"));
  };

  const deleteRollAt = (rollIdx: number) => {
    const newRolls = [...config.rolls];
    if (newRolls.length <= 1 || !newRolls[rollIdx]) return false;

    let targetCut: number | null = null;
    if (rollIdx > 0 && !newRolls[rollIdx - 1].isJoint) {
      targetCut = rollIdx - 1;
    } else if (rollIdx < newRolls.length - 1 && !newRolls[rollIdx].isJoint) {
      targetCut = rollIdx;
    }

    if (targetCut === null) {
      alert("无法删除此卷，因为必须保留这部分的接头出带节点！");
      setDeleteConfirmIdx(null);
      return false;
    }

    if (targetCut === rollIdx - 1) {
      newRolls[rollIdx - 1].targetFormedLength += newRolls[rollIdx].targetFormedLength;
      newRolls[rollIdx - 1].isJoint = newRolls[rollIdx - 1].isJoint || newRolls[rollIdx].isJoint;
      newRolls.splice(rollIdx, 1);
      setEditingRollIdx(Math.max(0, rollIdx - 1));
    } else {
      newRolls[rollIdx].targetFormedLength += newRolls[rollIdx + 1].targetFormedLength;
      newRolls[rollIdx].isJoint = newRolls[rollIdx].isJoint || newRolls[rollIdx + 1].isJoint;
      newRolls.splice(rollIdx + 1, 1);
      setEditingRollIdx(Math.min(rollIdx, newRolls.length - 1));
    }

    updateConfig(lineId, { ...config, rolls: newRolls });
    setDeleteConfirmIdx(null);
    return true;
  };

  const triggerRangeReminder = (rollIdx: number) => {
    const token = Date.now();
    setRangeFlashByIdx((prev) => ({ ...prev, [rollIdx]: token }));
    navigator.vibrate?.([18, 30, 18]);
    window.setTimeout(() => {
      setRangeFlashByIdx((prev) => {
        if (prev[rollIdx] !== token) return prev;
        const next = { ...prev };
        delete next[rollIdx];
        return next;
      });
    }, 700);
  };

  const checkRangeBoundaryReminder = (rollIdx: number, length: number) => {
    const status = getDefaultRangeStatus(lineId, length);
    const previousStatus =
      lastRangeStatusRef.current[rollIdx] ??
      getDefaultRangeStatus(lineId, Number(config.rolls[rollIdx]?.targetFormedLength || 0));
    lastRangeStatusRef.current[rollIdx] = status;

    if (status !== "ok" && previousStatus !== status) {
      triggerRangeReminder(rollIdx);
    }
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggingIdx === null || !barRef.current) return;
      if (dragStartRef.current) {
        const dx = Math.abs(e.clientX - dragStartRef.current.x);
        const dy = Math.abs(e.clientY - dragStartRef.current.y);
        if (dx > 4 || dy > 4) {
          dragMovedRef.current = true;
        }
      }
      const rect = barRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));

      // X corresponds to absolute minutes from shift start
      const cursorMinutesFromStart = pctToMinute((x / rect.width) * 100);

      // Convert time back to cumulative length
      const firstCarryIn = getFirstRollCarryIn(config);
      const cursorTime = addMinutes(shiftStart, cursorMinutesFromStart);
      const newCumulative =
        distanceBetweenWithSpeed(currentTime, cursorTime, config, shiftStart) +
        firstCarryIn;

      const prevH = draggingIdx === 0 ? 0 : cumSum[draggingIdx - 1];
      const nextH = cumSum[draggingIdx + 1];

      let leftMin = MIN_MANUAL_FORMED_LENGTH;
      if (draggingIdx === 0) leftMin = Math.max(MIN_MANUAL_FORMED_LENGTH, firstCarryIn);
      const rightMin = getMinimumManualTarget(config, draggingIdx + 1);

      let minAllowedPos = prevH + leftMin;
      let maxAllowedPos = nextH - rightMin;

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
      checkRangeBoundaryReminder(draggingIdx, newRolls[draggingIdx].targetFormedLength);
      checkRangeBoundaryReminder(draggingIdx + 1, newRolls[draggingIdx + 1].targetFormedLength);
      setEditValue(Number(newRolls[draggingIdx].targetFormedLength || 0).toFixed(1));
      setEditTimeValue(format(cursorTime, "HH:mm"));

      updateConfig(lineId, { ...config, rolls: newRolls });
    };
    const handleUp = () => {
      setDraggingIdx(null);
      dragStartRef.current = null;
    };

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
    maxMinutes,
    shiftMinutes,
    currentShiftPct,
    updateConfig,
    currMinutesFromStart,
  ]);

  const isEditorOpen =
    editingRollIdx !== null && draggingIdx === null && Boolean(config.rolls[editingRollIdx]);

  useEffect(() => {
    if (!isEditorOpen) return;
    const handlePositionUpdate = () => updateEditorViewportAnchor(editorAnchorPct);
    handlePositionUpdate();
    window.addEventListener("resize", handlePositionUpdate);
    window.addEventListener("scroll", handlePositionUpdate, true);
    return () => {
      window.removeEventListener("resize", handlePositionUpdate);
      window.removeEventListener("scroll", handlePositionUpdate, true);
    };
  }, [isEditorOpen, editorAnchorPct, config.rolls.length]);

  return (
    <div className={cn("relative", isEditorOpen ? "z-[200]" : "z-10")}>
      <div
        ref={barRef}
        className="relative z-10 h-10 select-none rounded sm:h-12"
        style={{ touchAction: "pan-y" }}
        onClick={() => { setEditingRollIdx(null); setDeleteConfirmIdx(null); }}
      >
      {/* Render completed rolls first */}
      {getUnloadedCompletedRolls(config.completedRolls || []).map((cr: any, i: number) => {
        const endTime = new Date(cr.unrollTime);
        const endMinutesFromStart = differenceInMinutes(endTime, shiftStart);
        const startTime = subtractDistanceWithSpeed(endTime, cr.length, config, shiftStart);
        const startMinutesFromStart = differenceInMinutes(startTime, shiftStart);
        
        const pctLeft = minuteToPct(startMinutesFromStart);
        const pctRight = minuteToPct(endMinutesFromStart);
        const pctWidth = pctRight - pctLeft;
        
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
            {pctLeft + pctWidth > 0 && (
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
        const firstCarryIn = getFirstRollCarryIn(config);

        const startTime = addDistanceWithSpeed(currentTime, prevLength - firstCarryIn, config, shiftStart);
        const endTime = addDistanceWithSpeed(currentTime, currLength - firstCarryIn, config, shiftStart);

        const startMinutesFromShiftStart = differenceInMinutes(startTime, shiftStart);
        const endMinutesFromShiftStart = differenceInMinutes(endTime, shiftStart);

        const pctLeft = minuteToPct(startMinutesFromShiftStart);
        const pctWidth =
          minuteToPct(endMinutesFromShiftStart) -
          pctLeft;
        const jointAfterStartPct = roll.isJoint
          ? Math.max(
              0,
              Math.min(
                100,
                ((minuteToPct(
                  differenceInMinutes(
                    addSignedDistanceWithSpeed(
                      currentTime,
                      currLength - firstCarryIn - 240,
                      config,
                      shiftStart,
                    ),
                    shiftStart,
                  ),
                ) -
                  pctLeft) /
                  Math.max(1, pctWidth)) *
                  100,
              ),
            )
          : null;

        const isPoppedOut = pctWidth < 20;
        const rangeStatus = getDefaultRangeStatus(lineId, Number(roll.targetFormedLength || 0));
        const isRangeWarning = rangeStatus !== "ok";
        const isRangeFlashing = Boolean(rangeFlashByIdx[i]);

        return (
          <div
            key={roll.id}
            className={cn(
              "absolute top-0 bottom-0 border-r border-white group pointer-events-none",
              roll.isJoint && "z-20",
              isRangeWarning && "ring-2 ring-red-500/70 ring-inset",
              isRangeFlashing && "foil-range-warning-flash",
            )}
            style={{
              left: `${pctLeft}%`,
              width: `${pctWidth}%`,
              backgroundColor: roll.isJoint
                ? `hsl(32, 95%, ${i % 2 === 0 ? "90%" : "86%"})` // joint roll base
                : `hsl(215, 80%, ${i % 2 === 0 ? "90%" : "85%"})`, 
            }}
          >
            {roll.isJoint && jointAfterStartPct !== null && jointAfterStartPct < 100 && (
              <div
                className="absolute inset-y-0 right-0 pointer-events-none border-l border-orange-500/45"
                style={{
                  left: `${jointAfterStartPct}%`,
                  background:
                    "repeating-linear-gradient(135deg, rgba(251, 146, 60, 0.62) 0px, rgba(251, 146, 60, 0.62) 7px, rgba(248, 113, 113, 0.5) 7px, rgba(248, 113, 113, 0.5) 14px)",
                }}
              />
            )}

            {/* Joint Marker at the end of the roll */}
            {roll.isJoint && (
              <div className="absolute right-0 top-full mt-7 pointer-events-none flex flex-col items-center select-none" style={{ transform: "translateX(50%)" }}>
                <div className="w-px h-2 bg-orange-400"></div>
                <div className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                  末端接头必分卷
                </div>
              </div>
            )}
            
            {pctLeft + pctWidth > 0 && (
              <div 
                className={cn(
                  "absolute flex flex-col items-center pointer-events-auto cursor-pointer active:opacity-60 hover:opacity-80 transition-opacity",
                  isPoppedOut ? (roll.isJoint ? "bottom-full mb-2 z-40 overflow-visible whitespace-nowrap bg-orange-50 px-2 py-1 rounded-md shadow-md border border-orange-400" : "bottom-full mb-2 z-40 overflow-visible whitespace-nowrap bg-blue-50 px-2 py-1 rounded-md shadow-md border border-blue-400") : "top-0 bottom-0 justify-center px-1 whitespace-nowrap",
                  editingRollIdx !== i && !isPoppedOut && "overflow-hidden",
                  editingRollIdx === i && "z-50 overflow-visible"
                )}
                style={{
                  left: `50%`,
                  transform: 'translateX(-50%)',
                  touchAction: "pan-y"
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectRollEditor(i, pctLeft + pctWidth / 2);
                }}
              >
                {false && editingRollIdx === i ? (
                  <div className="relative flex items-center gap-1 bg-white p-0.5 rounded shadow border border-slate-200" onClick={e => e.stopPropagation()}>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const el = document.activeElement as HTMLElement;
                      if (el) el.blur();
                    }} className="flex items-center">
                      <input 
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        step="0.1"
                        className="w-14 pl-1 py-1 text-xs font-bold text-blue-900 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                        style={{ appearance: 'none', WebkitAppearance: 'none' }}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const val = parsePositiveDecimalInput(editValue);
                          if (val !== null && val !== roll.targetFormedLength) {
                            checkRangeBoundaryReminder(i, val);
                            updateConfig(lineId, updateRollTargetWithBorrow(config, i, val));
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
                          const wasJoint = newRolls[i].isJoint;
                          
                          newRolls[i].targetFormedLength = half;
                          newRolls[i].isJoint = false;
                          
                          newRolls.splice(i + 1, 0, {
                            id: Math.random().toString(),
                            targetFormedLength: half,
                            isJoint: wasJoint,
                            batchNumber: newRolls[i].batchNumber,
                            formedBatchNo: newRolls[i].formedBatchNo
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
                                  
                                  let targetCut: number | null = null;
                                  if (i > 0 && !newRolls[i-1].isJoint) {
                                      targetCut = i - 1; 
                                  } else if (i < newRolls.length - 1 && !newRolls[i].isJoint) {
                                      targetCut = i;
                                  }
                                  
                                  if (targetCut === null) {
                                     alert("无法删除此卷，因为必须保留这部分的接头出带节点！");
                                     setDeleteConfirmIdx(null);
                                     return;
                                  }

                                  if (targetCut === i - 1) {
                                      newRolls[i-1].targetFormedLength += newRolls[i].targetFormedLength;
                                      newRolls[i-1].isJoint = newRolls[i-1].isJoint || newRolls[i].isJoint;
                                      newRolls.splice(i, 1);
                                  } else {
                                      newRolls[i].targetFormedLength += newRolls[i+1].targetFormedLength;
                                      newRolls[i].isJoint = newRolls[i].isJoint || newRolls[i+1].isJoint;
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
                    {isRangeWarning && (
                      <span className="text-[8px] sm:text-[9px] font-black text-red-600 leading-none mt-0.5 truncate">
                        超默认范围
                      </span>
                    )}
                    
                    {(() => {
                      if (startMinutesFromShiftStart > shiftMinutes) {
                        return (
                          <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 leading-none mt-0.5 truncate">
                            (全在下班产)
                          </span>
                        );
                      }
                      
                      const carryIn = i === 0 ? getFirstRollCarryIn(config) : 0;
                      let inShift = roll.targetFormedLength - carryIn;
                      
                      if (endMinutesFromShiftStart > shiftMinutes) {
                         const spillLength = distanceBetweenWithSpeed(addMinutes(shiftStart, shiftMinutes), endTime, config, shiftStart);
                         inShift = Math.max(0, inShift - spillLength);
                         
                         return (
                            <span className="text-[8px] sm:text-[9px] font-bold text-amber-700/80 leading-none mt-0.5 truncate">
                              (下班产 {spillLength.toFixed(1)}m)
                            </span>
                         );
                      }
                      
                      if (carryIn > 0) {
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
        const nodeTime = addDistanceWithSpeed(currentTime, h - getFirstRollCarryIn(config), config, shiftStart);
        const minutesElapsed = differenceInMinutes(nodeTime, currentTime);
        const minutesFromShiftStart = currMinutesFromStart + minutesElapsed;
        const leftPct = minuteToPct(minutesFromShiftStart);
        const isJoint = config.rolls[i].isJoint;
        const isDraggable = !isJoint;
        const isBoundaryFlashing = Boolean(rangeFlashByIdx[i] || rangeFlashByIdx[i + 1]);
        
        let frontStartLeftPct = 0;
        let frontStartTime = new Date();
        if (isJoint) {
          const frontStartTimeForNode = addSignedDistanceWithSpeed(currentTime, h - getFirstRollCarryIn(config) - 240, config, shiftStart);
          const frontStartFromShiftStart = differenceInMinutes(frontStartTimeForNode, shiftStart);
          frontStartLeftPct = minuteToPct(frontStartFromShiftStart);
          frontStartTime = frontStartTimeForNode;
        }

        return (
          <React.Fragment key={"handle-" + i}>
            {isJoint && frontStartLeftPct >= 0 && frontStartLeftPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-yellow-400 z-10 pointer-events-none"
                style={{ left: `${frontStartLeftPct}%` }}
              >
                <div className="absolute bottom-full mb-0.5 transform -translate-x-1/2 left-1/2 flex flex-col items-center">
                  <div className="bg-yellow-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1 whitespace-nowrap">
                    <Flag size={10} className="fill-current" />
                    前端处理 {format(frontStartTime, "HH:mm")}
                  </div>
                  <div className="w-px h-1.5 bg-yellow-400"></div>
                </div>
              </div>
            )}
            
            <div
              className={cn(
                "absolute top-0 bottom-0 w-8 -ml-4 flex justify-center items-center z-20 transition-colors touch-none pointer-events-auto",
                isDraggable && "cursor-col-resize hover:bg-black/5 active:bg-black/10"
              )}
              style={{ left: `${leftPct}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!isDraggable) {
                  selectRollEditor(i, leftPct);
                  return;
                }
                dragStartRef.current = { x: e.clientX, y: e.clientY };
                dragMovedRef.current = false;
                setEditingRollIdx(null);
                setDeleteConfirmIdx(null);
                e.currentTarget.setPointerCapture(e.pointerId);
                setDraggingIdx(i);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (!isDraggable) return;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                if (!dragMovedRef.current) {
                  selectRollEditor(i, leftPct);
                }
                setDraggingIdx(null);
                dragStartRef.current = null;
              }}
              onPointerCancel={() => {
                setDraggingIdx(null);
                dragStartRef.current = null;
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  "w-1.5 h-8 rounded-full shadow-md transition-colors relative flex items-center justify-center",
                  draggingIdx === i
                    ? "bg-blue-600"
                    : (isDraggable ? "bg-white border border-slate-300" : "bg-red-500 border border-red-600 shadow-red-500/50 z-10"),
                  isBoundaryFlashing && "foil-range-warning-handle",
                )}
              >
                {isJoint && (
                  <div className="absolute -top-6 text-red-500 z-20 hover:scale-125 transition-transform drop-shadow" title="接头出线">
                    <Flag size={18} fill="currentColor" />
                  </div>
                )}
              </div>
              <div className="absolute top-[110%] w-max bg-slate-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {isJoint && <Flag size={10} fill="currentColor" className="text-red-400" />}
                {nodeTime.getDate() !== shiftStart.getDate() ? format(nodeTime, "MM-dd HH:mm") : format(nodeTime, "HH:mm")}
              </div>
              <div className={cn("absolute top-full mt-1 border text-[9px] font-bold px-1.5 py-0.5 rounded pointer-events-none flex items-center gap-1 whitespace-nowrap shadow-sm",
                isJoint ? "bg-orange-50/90 border-orange-200/50 text-orange-800" : "bg-blue-50/90 border-blue-200/50 text-blue-800"
              )}>
                <span className="font-mono">{nodeTime.getDate() !== shiftStart.getDate() ? format(nodeTime, "MM-dd HH:mm") : format(nodeTime, "HH:mm")}</span>
                <span className="opacity-70 text-[8px]">{config.rolls[i].targetFormedLength.toFixed(1)}m</span>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      </div>

      {isEditorOpen && editingRollIdx !== null && config.rolls[editingRollIdx] && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[9999] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
          style={{
            left: `${editorViewportAnchor.left}px`,
            top: `${editorViewportAnchor.top}px`,
            width: "min(320px, calc(100vw - 32px))",
            transform: "translateX(-50%)",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const activeRoll = config.rolls[editingRollIdx];
            const activeEndTime = getRollEndTime(editingRollIdx);
            const timeLabel =
              activeEndTime.getDate() !== shiftStart.getDate()
                ? format(activeEndTime, "MM-dd HH:mm")
                : format(activeEndTime, "HH:mm");
            const rangeStatus = getDefaultRangeStatus(
              lineId,
              Number(activeRoll.targetFormedLength || 0),
            );
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-800">
                      {lineId}# 线 · 卷 #{editingRollIdx + 1}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                      当前分卷时间 {timeLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRollIdx(null);
                      setDeleteConfirmIdx(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-500 active:scale-95"
                  >
                    收起
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-black text-slate-500">
                      目标米数
                    </span>
                    <div className={cn(
                      "flex min-w-0 items-center rounded-lg border bg-slate-50 focus-within:ring-2",
                      rangeStatus !== "ok"
                        ? "border-red-300 focus-within:ring-red-200"
                        : "border-slate-200 focus-within:ring-blue-200",
                    )}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(event) => setEditValue(event.currentTarget.value)}
                        onBlur={() => commitLengthEdit(editingRollIdx)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitLengthEdit(editingRollIdx);
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setEditValue(Number(activeRoll.targetFormedLength || 0).toFixed(1));
                            event.currentTarget.blur();
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-black font-mono text-slate-900 outline-none"
                      />
                      <span className="pr-2 text-[10px] font-bold text-slate-400">m</span>
                    </div>
                  </label>

                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-black text-slate-500">
                      分卷时间
                    </span>
                    <input
                      type="time"
                      value={editTimeValue}
                      onChange={(event) => setEditTimeValue(event.currentTarget.value)}
                      onBlur={() => commitTimeEdit(editingRollIdx)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitTimeEdit(editingRollIdx);
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditTimeValue(format(getRollEndTime(editingRollIdx), "HH:mm"));
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm font-black font-mono text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => addRollAfter(editingRollIdx)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm active:scale-95"
                  >
                    <Plus size={14} strokeWidth={3} />
                    加卷
                  </button>

                  {config.rolls.length > 1 && (
                    deleteConfirmIdx === editingRollIdx ? (
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => deleteRollAt(editingRollIdx)}
                          className="rounded-lg bg-red-600 px-2 py-2 text-[11px] font-black text-white active:scale-95"
                        >
                          确认
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmIdx(null)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-black text-slate-600 active:scale-95"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmIdx(editingRollIdx)}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 active:scale-95"
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })()}
        </div>,
        document.body,
      )}
    </div>
  );
}

function AppLoginScreen({
  accounts,
  onLogin,
}: {
  accounts: AppAccount[];
  onLogin: (account: AppAccount) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = accounts.find(
      (item) => item.username === username.trim() && item.password === password,
    );
    if (!account) {
      setError("账号或密码错误");
      return;
    }
    setError("");
    onLogin(account);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-xl p-6 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-black text-slate-900">智能箔材系统</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">请使用分配的应用账号登录</p>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">账号</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        {error && <div className="text-xs font-bold text-red-500">{error}</div>}
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-black shadow-sm"
        >
          登录
        </button>
      </form>
    </div>
  );
}

function UserAssignmentPage({
  accounts,
  currentUsername,
  onOpenMenu,
  onLogout,
  onAccountsChange,
}: {
  accounts: AppAccount[];
  currentUsername: string;
  onOpenMenu: () => void;
  onLogout: () => void;
  onAccountsChange: (accounts: AppAccount[]) => void;
}) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLines, setNewLines] = useState<AssignedLine[]>(normalizeLines(DEFAULT_LINE_ASSIGNMENTS));
  const [message, setMessage] = useState("");

  const saveAccounts = (nextAccounts: AppAccount[]) => {
    const normalized = normalizeAccounts(nextAccounts);
    writeLocalStorageWithBackup(ACCOUNT_STORAGE_KEY, JSON.stringify(normalized));
    onAccountsChange(normalized);
  };

  const updateAccount = (username: string, updater: (account: AppAccount) => AppAccount) => {
    saveAccounts(accounts.map((account) => (
      account.username === username ? updater(account) : account
    )));
  };

  const createAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.trim();
    if (!username || !newPassword) {
      setMessage("请填写账号和密码");
      return;
    }
    if (accounts.some((account) => account.username === username)) {
      setMessage("账号已存在");
      return;
    }
    saveAccounts([
      ...accounts,
      {
        username,
        password: newPassword,
        role: "user",
        lines: normalizeLines(newLines),
      },
    ]);
    setNewUsername("");
    setNewPassword("");
    setNewLines(normalizeLines(DEFAULT_LINE_ASSIGNMENTS));
    setMessage("新账号已创建");
  };

  const removeAccount = (username: string) => {
    if (username === "admin" || username === currentUsername) return;
    saveAccounts(accounts.filter((account) => account.username !== username));
  };

  return (
    <div className="bg-slate-50 flex-1 overflow-auto p-4 sm:p-6 sm:rounded-3xl shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={onOpenMenu}
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors h-10"
            type="button"
          >
            <Menu size={24} />
          </button>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-800">用户分配</h2>
            <p className="text-sm font-bold text-slate-500">
              为每个账号分配生产线编号和默认车速，新账号下次登录后会按这里的配置初始化。
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="self-start bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs font-black"
          type="button"
        >
          退出登录
        </button>
      </div>

      <form onSubmit={createAccount} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-6">
        <h3 className="font-black text-slate-800 mb-4">新建账号</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">账号</label>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">密码</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          {newLines.map((line, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">生产线编号</label>
                <input
                  value={line.id}
                  onChange={(e) => {
                    const next = [...newLines];
                    next[index] = { ...next[index], id: e.target.value };
                    setNewLines(next);
                  }}
                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">默认车速</label>
                <input
                  type="number"
                  step="0.01"
                  value={line.speed}
                  onChange={(e) => {
                    const next = [...newLines];
                    next[index] = { ...next[index], speed: Number(e.target.value) };
                    setNewLines(next);
                  }}
                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-bold"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-black" type="submit">
            新建账号
          </button>
          {message && <span className="text-xs font-bold text-slate-500">{message}</span>}
        </div>
      </form>

      <div className="space-y-4">
        {accounts.map((account) => (
          <section key={account.username} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-black text-slate-800">
                  {account.username}
                  {account.role === "admin" && <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">管理员</span>}
                </div>
                <div className="text-xs font-bold text-slate-400">应用账号</div>
              </div>
              <button
                onClick={() => removeAccount(account.username)}
                disabled={account.username === "admin" || account.username === currentUsername}
                className="text-xs font-bold text-red-500 disabled:text-slate-300 disabled:cursor-not-allowed"
                type="button"
              >
                删除账号
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">密码</label>
                <input
                  value={account.password}
                  disabled={account.username === "admin"}
                  onChange={(e) => updateAccount(account.username, (item) => ({ ...item, password: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {normalizeLines(account.lines).map((line, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">生产线编号</label>
                      <input
                        value={line.id}
                        onChange={(e) => updateAccount(account.username, (item) => {
                          const nextLines = normalizeLines(item.lines);
                          nextLines[index] = { ...nextLines[index], id: e.target.value };
                          return { ...item, lines: nextLines };
                        })}
                        className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">默认车速</label>
                      <input
                        type="number"
                        step="0.01"
                        value={line.speed}
                        onChange={(e) => updateAccount(account.username, (item) => {
                          const nextLines = normalizeLines(item.lines);
                          nextLines[index] = { ...nextLines[index], speed: Number(e.target.value) };
                          return { ...item, lines: nextLines };
                        })}
                        className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState<AppAccount[]>(() => loadAccounts());
  const [appUser, setAppUser] = useState<AppAccount | null>(() => {
    const savedUsername = readLocalStorageWithBackup(SESSION_STORAGE_KEY);
    if (!savedUsername) return null;
    return loadAccounts().find((account) => account.username === savedUsername) || null;
  });
  const lineAssignments = useMemo(() => normalizeLines(appUser?.lines), [appUser]);
  const activeLines = useMemo(() => lineAssignments.map((line) => line.id), [lineAssignments]);

  const [timeOffset, setTimeOffset] = useState(0);
  const [isPlanningMode, setIsPlanningMode] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rosterSettings, setRosterSettings] = useState<RosterSettings>(() =>
    loadRosterSettings(),
  );
  const [showSimulator, setShowSimulator] = useState(false);
  const [simDateStr, setSimDateStr] = useState("");
  const [simTimeStr, setSimTimeStr] = useState("");

  const [activePage, setActivePage] = useState<"dashboard" | "plan" | "admin" | "settings" | "daily_record" | "users" | "joint_tracking" | "line_meters">("dashboard");

  // -- Shift info --
  const shiftInfo = getShiftInfo(currentTime, rosterSettings);
  const scheduleTime = isPlanningMode ? getPlanningShiftStart(currentTime) : currentTime;

  const handleRosterSettingsChange = (settings: RosterSettings) => {
    const normalized = {
      anchorDate: settings.anchorDate || DEFAULT_ROSTER_SETTINGS.anchorDate,
      cycleDay: normalizeShiftCycleDay(settings.cycleDay),
    };
    saveRosterSettings(normalized);
    setRosterSettings(normalized);
  };

  // If the user opens this on a rest day, provide a way to simulate a workday for the timeline
  const viewDate =
    shiftInfo.type === "Rest" ? getRosterAnchorDate(rosterSettings) : startOfDay(currentTime);

  const viewShiftInfo = getShiftInfo(viewDate, rosterSettings);

  // -- punch state --
  const [punchRecords, setPunchRecords] = useState<
    Record<string, { in: boolean; out: boolean }>
  >({});

  const { user } = useAuth();
  
  const dateKey = format(getCurrentShiftStart(scheduleTime), "yyyy-MM-dd");



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
  const [lastWashes, setLastWashes] = useState<Record<LineId, Date | null>>(() =>
    createLineDateMap(lineAssignments, null),
  );
  const [jointSlotConfigs, setJointSlotConfigs] = useState<Record<LineId, JointSlotConfig[]>>(() =>
    createJointSlotMap(lineAssignments),
  );
  const [jointCalibrationMarks, setJointCalibrationMarks] = useState<Record<LineId, JointCalibrationMark[]>>(() =>
    createJointCalibrationMap(lineAssignments),
  );
  const [lineMeterReadings, setLineMeterReadings] = useState<Record<LineId, LineMeterReading>>(() =>
    createLineMeterMap(lineAssignments),
  );
  const [lineMeterInputs, setLineMeterInputs] = useState<Record<LineId, string>>(() =>
    createLineDateMap(lineAssignments, ""),
  );
  const [lineMeterSpeedInputs, setLineMeterSpeedInputs] = useState<Record<LineId, string>>(() =>
    createLineSpeedInputMap(lineAssignments),
  );
  const [lineMeterMessages, setLineMeterMessages] = useState<Record<LineId, string>>({});

  // -- line config states --
  const [lineConfigs, setLineConfigs] = useState<
    Record<LineId, LinePlanConfig>
  >(() => createLineConfigMap(lineAssignments));
  const [lineSpeedDrafts, setLineSpeedDrafts] = useState<Partial<Record<LineId, string>>>({});
  const [segmentSpeedDrafts, setSegmentSpeedDrafts] = useState<Record<string, string>>({});
  const [rollTargetDrafts, setRollTargetDrafts] = useState<Record<string, string>>({});

  // -- form states --
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "plan" | "forecast" | "splicing" | "unroll"
  >("plan");
  const [selectedLine, setSelectedLine] = useState<LineId>(activeLines[0]);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [planSuccess, setPlanSuccess] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
  const [addFoilDialog, setAddFoilDialog] = useState<boolean>(false);
  const [addFoilBatch, setAddFoilBatch] = useState<string>("");
  const [addFoilLength, setAddFoilLength] = useState<string>("");
  const [cutFoilDialog, setCutFoilDialog] = useState<boolean>(false);
  const [cutFoilLength, setCutFoilLength] = useState<string>("");
  const [forecastBatches, setForecastBatches] = useState<Record<string, string>>({});
  const [forecastLengths, setForecastLengths] = useState<Record<string, string>>({});
  const [showOnlyJointPrep, setShowOnlyJointPrep] = useState(false);
  const [showCompletedRolls, setShowCompletedRolls] = useState(false);
  const [showPastShiftEvents, setShowPastShiftEvents] = useState(false);
  const [showWorkbenchControls, setShowWorkbenchControls] = useState(true);
  const [localBackupMessage, setLocalBackupMessage] = useState("");
  const [backupExportDialog, setBackupExportDialog] = useState<{
    fileName: string;
    content: string;
  } | null>(null);
  const [backupCopyStatus, setBackupCopyStatus] = useState<"idle" | "success" | "manual" | "error">("idle");
  const [showBackupTextImport, setShowBackupTextImport] = useState(false);
  const [backupImportText, setBackupImportText] = useState("");
  const [rollCompletionInputs, setRollCompletionInputs] = useState<Record<LineId, string>>(() =>
    createLineDateMap(lineAssignments, ""),
  );
  const [rollCompletionTimeInputs, setRollCompletionTimeInputs] = useState<Record<LineId, string>>(() =>
    createLineDateMap(lineAssignments, ""),
  );
  const [mealConfig, setMealConfig] = useState<MealConfig>({
    lunchStart: 11 + 35 / 60,
    lunchEnd: 12 + 15 / 60,
    dinnerStart: 17 + 10 / 60,
    dinnerEnd: 17 + 50 / 60,
  });
  const localStateHydratedKeyRef = useRef<string | null>(null);
  const localBackupInputRef = useRef<HTMLInputElement | null>(null);
  const backupExportTextRef = useRef<HTMLTextAreaElement | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastWorkbenchMeterSpeedsRef = useRef<Record<LineId, number>>({});
  const lineMeterReadingsRef = useRef<Record<LineId, LineMeterReading>>({});

  const syncLineMeterSpeedFromWorkbench = (lineId: LineId, speed: number) => {
    if (!appUser || !Number.isFinite(speed) || speed < 0) return;
    const roundedSpeed = Number(speed.toFixed(3));
    const now = new Date();
    const currentReadings = lineMeterReadingsRef.current;
    const reading = currentReadings[lineId] || {
      value: null,
      speed: null,
      updatedAt: null,
    };
    const liveValue = getLiveLineMeterValue(reading, now);
    const nextReading: LineMeterReading = liveValue === null
      ? {
          value: null,
          speed: roundedSpeed,
          updatedAt: null,
        }
      : {
          value: Number(liveValue.toFixed(6)),
          speed: roundedSpeed,
          updatedAt: now.toISOString(),
        };
    const nextReadings = {
      ...currentReadings,
      [lineId]: nextReading,
    };

    try {
      writeLocalStorageWithBackup(
        getRealtimeMeterStorageKey(appUser.username),
        JSON.stringify(nextReadings),
      );
      setLineMeterReadings(nextReadings);
      setLineMeterSpeedInputs((prev) => ({ ...prev, [lineId]: String(roundedSpeed) }));
      if (liveValue !== null) {
        setLineMeterInputs((prev) => ({ ...prev, [lineId]: liveValue.toFixed(2) }));
      }
      setLineMeterMessages((prev) => ({
        ...prev,
        [lineId]: "已跟随工作台车速更新",
      }));
    } catch {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "车速同步失败，请检查本地空间" }));
    }
  };

  const playRackAlarmBurst = () => {
    const AudioCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const audioContext = audioContextRef.current || new AudioCtor();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const now = audioContext.currentTime;
    [0, 0.22, 0.44].forEach((offset) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(920, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.65, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.18);
    });
  };

  const stopRackAlarm = () => {
    if (alarmIntervalRef.current !== null) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  useEffect(() => {
    setLineConfigs((prev) => mergeLineConfigs(prev, lineAssignments));
    setLastWashes((prev) => ({
      ...createLineDateMap(lineAssignments, null),
      ...Object.fromEntries(
        activeLines
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setRollCompletionInputs((prev) => ({
      ...createLineDateMap(lineAssignments, ""),
      ...Object.fromEntries(
        activeLines
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setRollCompletionTimeInputs((prev) => ({
      ...createLineDateMap(lineAssignments, ""),
      ...Object.fromEntries(
        activeLines
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setJointSlotConfigs((prev) => mergeJointSlotConfigs(prev, lineAssignments));
    setJointCalibrationMarks((prev) => mergeJointCalibrationMarks(prev, lineAssignments));
    setLineMeterReadings((prev) => normalizeLineMeterReadings(prev, lineAssignments));
    setLineMeterInputs((prev) => ({
      ...createLineDateMap(lineAssignments, ""),
      ...Object.fromEntries(
        activeLines
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setLineMeterSpeedInputs((prev) => ({
      ...createLineSpeedInputMap(lineAssignments),
      ...Object.fromEntries(
        activeLines
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setSelectedLine((prev) => (activeLines.includes(prev) ? prev : activeLines[0]));
  }, [activeLines, lineAssignments]);

  useEffect(() => {
    if (!appUser) return;
    let parsed: unknown = null;
    try {
      const saved = readLocalStorageWithBackup(getRealtimeMeterStorageKey(appUser.username));
      parsed = saved ? JSON.parse(saved) : null;
    } catch {
      parsed = null;
    }
    const restored = normalizeLineMeterReadings(parsed, lineAssignments);
    setLineMeterReadings(restored);
    setLineMeterInputs(
      Object.fromEntries(
        activeLines.map((line) => [
          line,
          restored[line]?.value === null || restored[line]?.value === undefined
            ? ""
            : String(restored[line].value),
        ]),
      ),
    );
    setLineMeterSpeedInputs(
      Object.fromEntries(
        activeLines.map((line) => [
          line,
          restored[line]?.speed === null || restored[line]?.speed === undefined
            ? String(getDefaultLineSpeed(line))
            : String(restored[line].speed),
        ]),
      ),
    );
    setLineMeterMessages({});
  }, [appUser, activeLines, lineAssignments]);

  useEffect(() => {
    lineMeterReadingsRef.current = lineMeterReadings;
  }, [lineMeterReadings]);

  useEffect(() => {
    if (!appUser) return;
    // One-way sync: planning speed updates realtime meter tracking, but realtime corrections never rewrite the planning speed.
    const nextSpeeds: Record<LineId, number> = {};
    activeLines.forEach((lineId) => {
      const config = lineConfigs[lineId];
      if (!config) return;
      const effectiveSpeed = Number(
        getSpeedAtTime(config, currentTime, scheduleTime).toFixed(3),
      );
      nextSpeeds[lineId] = effectiveSpeed;
      const previousSpeed = lastWorkbenchMeterSpeedsRef.current[lineId];
      if (
        previousSpeed !== undefined &&
        Math.abs(previousSpeed - effectiveSpeed) > 0.0005
      ) {
        syncLineMeterSpeedFromWorkbench(lineId, effectiveSpeed);
      }
    });
    lastWorkbenchMeterSpeedsRef.current = {
      ...lastWorkbenchMeterSpeedsRef.current,
      ...nextSpeeds,
    };
  }, [appUser, activeLines, lineConfigs, currentTime, scheduleTime]);

  useEffect(() => {
    if (!appUser) return;
    void navigator.storage?.persist?.();
  }, [appUser]);

  useEffect(() => {
    if (!appUser) return;
    const storageKey = getLocalLineStateKey(appUser.username, dateKey);
    pruneLocalStorageByDatePrefix(`${LOCAL_LINE_STATE_PREFIX}:${appUser.username}:`, dateKey);
    pruneLocalStorageByDatePrefix(`${DAILY_RECORD_PREFIX}_${appUser.username}_`, dateKey);
    localStateHydratedKeyRef.current = null;
    const restored = reviveLocalLineState(readLocalStorageWithBackup(storageKey), lineAssignments);
    if (restored) {
      setLineConfigs(restored.lineConfigs);
      setActiveSplicing(restored.activeSplicing);
      setLastWashes(restored.lastWashes);
      setJointSlotConfigs(restored.jointSlotConfigs);
      setJointCalibrationMarks(restored.jointCalibrationMarks);
      setPunchRecords(restored.punchRecords);
    } else {
      setLineConfigs((prev) => mergeLineConfigs(prev, lineAssignments));
      setJointSlotConfigs((prev) => mergeJointSlotConfigs(prev, lineAssignments));
      setJointCalibrationMarks((prev) => mergeJointCalibrationMarks(prev, lineAssignments));
      setLastWashes((prev) => ({
        ...createLineDateMap(lineAssignments, null),
        ...Object.fromEntries(
          activeLines
            .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
            .map((line) => [line, prev[line]]),
        ),
      }));
    }
    localStateHydratedKeyRef.current = storageKey;
  }, [appUser, activeLines, dateKey, lineAssignments]);

  useEffect(() => {
    if (!appUser) return;
    const storageKey = getLocalLineStateKey(appUser.username, dateKey);
    if (localStateHydratedKeyRef.current !== storageKey) return;
    const timer = setTimeout(() => {
      writeLocalStorageWithBackup(storageKey, JSON.stringify({
        lineConfigs,
        activeSplicing,
        lastWashes,
        jointSlotConfigs,
        jointCalibrationMarks,
        punchRecords,
        savedAt: new Date().toISOString(),
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [lineConfigs, activeSplicing, lastWashes, jointSlotConfigs, jointCalibrationMarks, punchRecords, appUser, dateKey]);

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/punchRecords/${dateKey}`;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'punchRecords', dateKey), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const data = docSnap.data();
          if (data.records) {
            setPunchRecords(prev => {
              const currentStr = JSON.stringify(prev);
              return currentStr !== data.records ? JSON.parse(data.records) : prev;
            });
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
          if (data.lineConfigs) {
            setLineConfigs(prev => {
              const parsed = JSON.parse(data.lineConfigs);
              const merged = mergeLineConfigs(parsed, lineAssignments);
              const currentStr = JSON.stringify(prev);
              const nextStr = JSON.stringify(merged);
              return currentStr !== nextStr ? merged : prev;
            });
          }
          if (data.activeSplicing) {
            setActiveSplicing(prev => {
              const currentStr = JSON.stringify(prev);
              return currentStr !== data.activeSplicing ? JSON.parse(data.activeSplicing) : prev;
            });
          }
          if (data.lastWashes) {
             setLastWashes(prev => {
              const currentStr = JSON.stringify(prev);
              return currentStr !== data.lastWashes ? JSON.parse(data.lastWashes) : prev;
            });
          }
          if (data.jointSlotConfigs) {
             setJointSlotConfigs(prev => {
              const currentStr = JSON.stringify(prev);
              return currentStr !== data.jointSlotConfigs ? mergeJointSlotConfigs(JSON.parse(data.jointSlotConfigs), lineAssignments) : prev;
            });
          }
          if (data.jointCalibrationMarks) {
             setJointCalibrationMarks(prev => {
              const currentStr = JSON.stringify(prev);
              return currentStr !== data.jointCalibrationMarks ? mergeJointCalibrationMarks(JSON.parse(data.jointCalibrationMarks), lineAssignments) : prev;
            });
          }
        } catch(e) {
          handleFirestoreError(e, OperationType.GET, path);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, [user, dateKey, lineAssignments]);

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
          jointSlotConfigs: JSON.stringify(jointSlotConfigs),
          jointCalibrationMarks: JSON.stringify(jointCalibrationMarks),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);
  }, [lineConfigs, activeSplicing, lastWashes, jointSlotConfigs, jointCalibrationMarks, user, dateKey]);

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

  const lastCompleteTimeRef = useRef<{ [key: string]: number }>({});
  
  const handleCompleteRoll = (lineId: LineId) => {
    const now = Date.now();
    if (lastCompleteTimeRef.current[lineId] && now - lastCompleteTimeRef.current[lineId] < 1000) {
      return; // prevent double clicks
    }
    lastCompleteTimeRef.current[lineId] = now;

    setLineConfigs((p) => {
      const c = p[lineId];
      if (c.rolls.length === 0) return p;

      const currentRoll = c.rolls[0];
      const actualLStr = rollCompletionInputs[lineId];
      const timeStr = rollCompletionTimeInputs[lineId];
      
      if (!actualLStr || !timeStr) return p;

      const actualL = parseFloat(actualLStr);
      if (isNaN(actualL) || actualL <= 0) return p;

      const [hours, minutes] = timeStr.split(":").map(Number);
      const unrollDate = new Date(currentTime);
      unrollDate.setHours(hours, minutes, 0, 0);

      if (unrollDate > currentTime) {
        // Must be yesterday
        unrollDate.setDate(unrollDate.getDate() - 1);
      }

      const carryIn = getFirstRollCarryIn(c);
      const corrosionConsumed = Math.max(0, actualL - carryIn);
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
      
      // Prevent duplicates by checking last completed entry if it happened within 2 seconds
      // OR better, just clear inputs immediately outside this state setter
      
      completed.push({
        id: Math.random().toString(),
        batchNo: currentRoll.formedBatchNo || "",
        corrosionBatchNo: currentRoll.batchNumber || "",
        length: actualL,
        corrosionConsumed,
        unrollTime: unrollDate.toISOString(),
      });

      const newMineUnrolled = completed.reduce(
        (sum, cr) => sum + (cr.isManual ? 0 : getCompletedRollCorrosionConsumed(cr)),
        0,
      );
      const newFProduced = distanceBetweenWithSpeed(
        unrollDate,
        currentTime,
        c,
        getCurrentShiftStart(unrollDate),
      );

      return {
        ...p,
        [lineId]: {
          ...c,
          rolls: newRolls,
          cUsed: Math.max(c.cUsed, (c.cPrevUsed || 0) + newMineUnrolled),
          fProduced: newFProduced,
          fPrevProduced: 0,
          completedRolls: completed,
        },
      };
    });

    setRollCompletionInputs((prev) => ({ ...prev, [lineId]: "" }));
    setRollCompletionTimeInputs((prev) => ({ ...prev, [lineId]: "" }));
  };

  const handleAddFutureRoll = (lineId: LineId) => {
    const fBatch = forecastBatches[lineId];
    const fLength = forecastLengths[lineId];
    if (!fBatch || !fLength) return;
    const lineConf = lineConfigs[lineId];
    const frs = lineConf.futureRolls || [];
    const newConfigs = {
      ...lineConfigs,
      [lineId]: {
        ...lineConf,
        futureRolls: [
          ...frs,
          {
            id: Math.random().toString(),
            batchNo: fBatch,
            length: Number(fLength),
          },
        ],
      },
    };
    handleGeneratePlan(lineId, newConfigs);
    setForecastBatches(p => ({ ...p, [lineId]: "" }));
    setForecastLengths(p => ({ ...p, [lineId]: "" }));
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

  const handleUpdateFutureRoll = (
    lineId: LineId,
    id: string,
    updates: Partial<Pick<FutureRoll, "batchNo" | "length">>,
  ) => {
    const p = lineConfigs;
    const newConfigs = {
      ...p,
      [lineId]: {
        ...p[lineId],
        futureRolls: (p[lineId].futureRolls || []).map((roll) =>
          roll.id === id ? { ...roll, ...updates } : roll,
        ),
      },
    };
    handleGeneratePlan(lineId, newConfigs);
  };

  const handleSavePlan = async () => {
    if (!user) return;
    try {
      const path = `users/${user.uid}/planSnapshots`;
      await addDoc(collection(db, "users", user.uid, "planSnapshots"), {
        userId: user.uid,
        timestamp: serverTimestamp(),
        lineConfigs: JSON.stringify(lineConfigs),
        activeSplicing: JSON.stringify(activeSplicing),
        lastWashes: JSON.stringify(lastWashes),
        jointSlotConfigs: JSON.stringify(jointSlotConfigs),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/planSnapshots`);
    }
  };

  // Form - Unroll
  const [unloadLength, setUnloadLength] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const baseTime = new Date(Date.now() + timeOffset);
      setCurrentTime(baseTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffset]);

  useEffect(() => {
    const hasRingingRackAlarm = activeSplicing.some(
      (task) =>
        task.rackTimerDueAt &&
        currentTime.getTime() >= new Date(task.rackTimerDueAt).getTime() &&
        !task.rackAlarmAcknowledged,
    );

    if (hasRingingRackAlarm && alarmIntervalRef.current === null) {
      playRackAlarmBurst();
      alarmIntervalRef.current = window.setInterval(playRackAlarmBurst, 2500);
    }

    if (!hasRingingRackAlarm) {
      stopRackAlarm();
    }

    return () => {
      if (!hasRingingRackAlarm) stopRackAlarm();
    };
  }, [activeSplicing, currentTime]);

  const handleTogglePlanningMode = () => {
    setIsPlanningMode((prev) => {
      const next = !prev;
      const baseTime = new Date(Date.now() + timeOffset);
      setCurrentTime(baseTime);
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

  const clearLineProductionData = (lineId: LineId) => {
    setLineConfigs((prev) => {
      const current = prev[lineId];
      if (!current) return prev;
      return {
        ...prev,
        [lineId]: {
          ...current,
          cTotal: 0,
          cUsed: 0,
          cPrevUsed: 0,
          fProduced: 0,
          fPrevProduced: 0,
          batchNo: "",
          futureRolls: [],
          completedRolls: [],
          rolls: [],
        },
      };
    });
    setActiveSplicing((prev) => prev.filter((task) => task.line !== lineId));
    setForecastBatches((prev) => ({ ...prev, [lineId]: "" }));
    setForecastLengths((prev) => ({ ...prev, [lineId]: "" }));
    setRollCompletionInputs((prev) => ({ ...prev, [lineId]: "" }));
    setRollCompletionTimeInputs((prev) => ({ ...prev, [lineId]: "" }));
    setRollTargetDrafts((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith(`${lineId}:`)),
      ),
    );
  };

  const ensureAlarmAudioReady = () => {
    const AudioCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor && !audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }
    void audioContextRef.current?.resume();
  };

  const handleStartRackCountdown = (taskId: string) => {
    ensureAlarmAudioReady();
    setActiveSplicing((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "waiting_rack",
              rackTimerStartedAt: currentTime,
              rackTimerDueAt: addMinutes(currentTime, getRackCountdownMinutes(task.line)),
              rackAlarmAcknowledged: false,
            }
          : task,
      ),
    );
  };

  const handleConfirmJointPrepComplete = (lineId: LineId, sourceRollId: string) => {
    ensureAlarmAudioReady();
    setActiveSplicing((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        line: lineId,
        startTime: currentTime,
        status: "waiting_rack",
        rackTimerStartedAt: currentTime,
        rackTimerDueAt: addMinutes(currentTime, getRackCountdownMinutes(lineId)),
        rackAlarmAcknowledged: false,
        sourceRollId,
      },
    ]);
  };

  const handleAcknowledgeRackAlarm = (taskId: string) => {
    stopRackAlarm();
    setActiveSplicing((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "passing_rack",
              rackAlarmAcknowledged: true,
            }
          : task,
      ),
    );
  };

  const markJointUPosition = (lineId: LineId, jointId: string, slotId: string, uIndex: number) => {
    const joint = getJointTrackingForLine(lineId).find((item) => item.id === jointId);
    const targetPoint = getCalibratedUPointsForLine(lineId).find(
      (point) => point.slot.id === slotId && point.uIndex === uIndex,
    );
    if (!joint || !targetPoint) return;
    const nextMark: JointCalibrationMark = {
      id: `${slotId}:${uIndex}`,
      slotId,
      uIndex,
      position: Number(targetPoint.position.toFixed(2)),
      markedAt: currentTime.toISOString(),
      jointId,
      positionRevision: JOINT_POSITION_DATA_REVISION,
    };
    setJointCalibrationMarks((prev) => ({
      ...prev,
      [lineId]: [
        ...(prev[lineId] || []).filter((mark) => !(mark.slotId === slotId && mark.uIndex === uIndex)),
        nextMark,
      ],
    }));
  };

  const clearJointUPosition = (lineId: LineId, slotId: string, uIndex: number) => {
    setJointCalibrationMarks((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter((mark) => !(mark.slotId === slotId && mark.uIndex === uIndex)),
    }));
  };

  // derived state for Splicing Tasks
  const updatedSplicingTasks = activeSplicing.map((task) => {
    const minElapsed = differenceInMinutes(currentTime, task.startTime);
    const rackDueAt = task.rackTimerDueAt ? new Date(task.rackTimerDueAt) : null;
    const rackRemainingMinutes = rackDueAt
      ? Math.ceil((rackDueAt.getTime() - currentTime.getTime()) / 60000)
      : null;
    // Legacy fallback only. Explicit rack timers use getRackCountdownMinutes by line.
    let displayStatus = "接箔中";
    let urgency = "normal";
    let progress = 0;

	    if (rackDueAt && !task.rackAlarmAcknowledged) {
	      displayStatus =
	        rackRemainingMinutes !== null && rackRemainingMinutes > 0
	          ? `过架子倒计时 (${rackRemainingMinutes}m)`
	          : "过架子时间到";
	      urgency = rackRemainingMinutes !== null && rackRemainingMinutes <= 0 ? "critical" : "warning";
	      const rackStart = task.rackTimerStartedAt ? new Date(task.rackTimerStartedAt) : task.startTime;
	      const rackTotalMs = Math.max(1, rackDueAt.getTime() - rackStart.getTime());
	      progress = Math.max(0, Math.min(100, ((currentTime.getTime() - rackStart.getTime()) / rackTotalMs) * 100));
    } else if (minElapsed < 30) {
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
    return { ...task, minElapsed, rackDueAt, rackRemainingMinutes, displayStatus, urgency, progress };
  });

  const handleGeneratePlan = (
    lineId: LineId,
    currentLineConfigs = lineConfigs,
  ) => {
    const conf = currentLineConfigs[lineId];
    let L = getCurrentCorrosionRemaining(conf);
    if (L <= 0 && (!conf.futureRolls || conf.futureRolls.length === 0)) {
      const nextConfigs = {
        ...currentLineConfigs,
        [lineId]: { ...conf, rolls: [] },
      };
      setLineConfigs(nextConfigs);
      setActiveSplicing((prev) => prev.filter((task) => task.line !== lineId));
      setRollTargetDrafts((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([key]) => !key.startsWith(`${lineId}:`)),
        ),
      );
      return nextConfigs;
    }
    const avg = lineId === "25" ? 550 : 475;
    const minL = lineId === "25" ? 300 : 400;
    const maxL = lineId === "25" ? 800 : 550;

    const shiftEnd = getCurrentShiftEnd(scheduleTime);

    // Collect planned times from OTHER lines to encourage bundling
    const otherRollTimes: number[] = [];
    activeLines.forEach((l) => {
      if (l !== lineId) {
        let accC = 0;
        currentLineConfigs[l].rolls.forEach((r, i) => {
          const cConsum = getRollCorrosionConsumed(r, i, currentLineConfigs[l]);
          accC += cConsum;
          const endT = addDistanceWithSpeed(scheduleTime, accC, currentLineConfigs[l], scheduleTime);
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

          const endTime = addDistanceWithSpeed(scheduleTime, globalAccC + accForFoil, conf, scheduleTime);
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
    activeLines.forEach((lineId) => {
      currentConfigs =
        handleGeneratePlan(lineId, currentConfigs) || currentConfigs;
    });
  };

  const getComputedPlanForLine = (lineId: LineId) => {
    const config = lineConfigs[lineId];
    let accC = 0;
    return config.rolls.map((roll, i) => {
      const startT =
        i === 0 ? scheduleTime : addDistanceWithSpeed(scheduleTime, accC, config, scheduleTime);
      const cConsum = getRollCorrosionConsumed(roll, i, config);
      accC += cConsum;
      const endT = addDistanceWithSpeed(scheduleTime, accC, config, scheduleTime);
      const meal = checkMealConflict(endT, mealConfig);
      const isWarning =
        (lineId === "25" &&
          (roll.targetFormedLength < 300 || roll.targetFormedLength > 800)) ||
        (lineId !== "25" &&
          (roll.targetFormedLength < 400 || roll.targetFormedLength > 550));
      return {
        ...roll,
        corrosionConsumed: cConsum,
        cumulativeCorrosion: accC,
        startTime: startT,
        endTime: endT,
        meal,
        isWarning,
      };
    });
  };

  const getJointUPointsForLine = (lineId: LineId) => {
    const slots = normalizeJointSlots(jointSlotConfigs[lineId]);
    const configuredTotal = slots.reduce((sum, slot) => sum + Number(slot.length || 0), 0) || 240;
    let cursor = 0;
    return slots.flatMap((slot, slotIndex) => {
      const slotLength = Number(slot.length || 0);
      const pointCount = Math.max(1, Number(slot.uCount));
      const points = Array.from({ length: pointCount }, (_, idx) => {
        const uIndex = slot.uCount > 0 ? idx + 1 : 0;
        const nominalPosition = cursor + ((idx + 0.5) / pointCount) * slotLength;
        return {
          key: `${slot.id}:${uIndex}`,
          slot,
          slotIndex,
          uIndex,
          defaultPosition: DEFAULT_JOINT_CALIBRATION_POSITIONS[`${slot.id}:${uIndex}`],
          nominalPosition: configuredTotal > 0 ? (nominalPosition / configuredTotal) * 240 : nominalPosition,
        };
      });
      cursor += slotLength;
      return points;
    });
  };

  const getCalibratedUPointsForLine = (lineId: LineId) => {
    const points = getJointUPointsForLine(lineId);
    const marks = jointCalibrationMarks[lineId] || [];
    const markMap = new Map<string, JointCalibrationMark>(marks.map((mark) => [`${mark.slotId}:${mark.uIndex}`, mark]));
    const seeded = points.map((point) => {
      const mark = markMap.get(point.key);
      const hasDefaultPosition =
        typeof point.defaultPosition === "number" && Number.isFinite(point.defaultPosition);
      return {
        ...point,
        measuredPosition: mark
          ? Math.max(0, Math.min(240, Number(mark.position || 0)))
          : hasDefaultPosition
            ? Number(point.defaultPosition)
            : null,
        manuallyCalibrated: Boolean(mark),
        fromDefault: !mark && hasDefaultPosition,
        hasDefaultPosition,
        markedAt: mark?.markedAt,
        jointId: mark?.jointId,
      };
    });

    const positionedPoints = seeded.map((point, index) => {
      if (point.measuredPosition !== null) {
        return {
          ...point,
          position: point.measuredPosition,
          calibrated: point.manuallyCalibrated,
        };
      }

      const prev = [...seeded.slice(0, index)].reverse().find((item) => item.measuredPosition !== null);
      const next = seeded.slice(index + 1).find((item) => item.measuredPosition !== null);
      let position = point.nominalPosition;

      if (prev && next && next.nominalPosition !== prev.nominalPosition) {
        const ratio = (point.nominalPosition - prev.nominalPosition) / (next.nominalPosition - prev.nominalPosition);
        position = Number(prev.measuredPosition) + ratio * (Number(next.measuredPosition) - Number(prev.measuredPosition));
      } else if (prev) {
        position = Number(prev.measuredPosition) + (point.nominalPosition - prev.nominalPosition);
      } else if (next) {
        position = Number(next.measuredPosition) - (next.nominalPosition - point.nominalPosition);
      }

      return {
        ...point,
        position: Math.max(0, Math.min(240, position)),
        calibrated: false,
        fromDefault: false,
      };
    });

    return positionedPoints.map((point) => {
      if (
        isFurnaceJointSlot(point.slot) &&
        point.uIndex === 2 &&
        point.measuredPosition === null
      ) {
        const furnaceFront = positionedPoints.find(
          (candidate) => candidate.slot.id === point.slot.id && candidate.uIndex === 1,
        );
        if (furnaceFront) {
          return {
            ...point,
            position: Math.min(240, furnaceFront.position + 2),
          };
        }
      }
      return point;
    }).sort((a, b) => a.position - b.position);
  };

  const getCalibratedLocationForLine = (lineId: LineId, distance: number) => {
    const points = getCalibratedUPointsForLine(lineId);
    if (points.length === 0) return null;
    const clamped = Math.max(0, Math.min(240, distance));

    let best = points[0];
    for (let index = 0; index < points.length; index += 1) {
      const prevBoundary = index === 0 ? -Infinity : (points[index - 1].position + points[index].position) / 2;
      const nextBoundary = index === points.length - 1 ? Infinity : (points[index].position + points[index + 1].position) / 2;
      if (clamped >= prevBoundary && clamped < nextBoundary) {
        best = points[index];
        break;
      }
    }
    return {
      ...best,
      distance: clamped,
      offsetToU: clamped - best.position,
    };
  };

  const getJointTrackingForLine = (lineId: LineId) => {
    const config = lineConfigs[lineId];
    const lineMarks = jointCalibrationMarks[lineId] || [];
    let accC = 0;

    return config.rolls
      .map((roll, index) => {
        const consumed = getRollCorrosionConsumed(roll, index, config);
        accC += consumed;
        if (!roll.isJoint) return null;

        const plannedExitTime = addDistanceWithSpeed(scheduleTime, accC, config, scheduleTime);
        const plannedStartTime = addSignedDistanceWithSpeed(scheduleTime, accC - 240, config, scheduleTime);
        const plannedDistance = distanceBetweenWithSpeed(
          plannedStartTime,
          currentTime,
          config,
          scheduleTime,
        );
        const trackingAnchor = lineMarks
          .filter((mark) => {
            if (mark.jointId !== roll.id) return false;
            const markedAt = new Date(mark.markedAt);
            return (
              Number.isFinite(Number(mark.position)) &&
              !Number.isNaN(markedAt.getTime()) &&
              markedAt.getTime() <= currentTime.getTime()
            );
          })
          .sort(
            (a, b) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime(),
          )[0];
        const anchorTime = trackingAnchor ? new Date(trackingAnchor.markedAt) : null;
        const anchorPosition = trackingAnchor
          ? Math.max(0, Math.min(240, Number(trackingAnchor.position)))
          : null;
        const distance = anchorTime !== null && anchorPosition !== null
          ? anchorPosition + distanceBetweenWithSpeed(
              anchorTime,
              currentTime,
              config,
              scheduleTime,
            )
          : plannedDistance;
        const startTime = anchorTime !== null && anchorPosition !== null
          ? subtractDistanceWithSpeed(
              anchorTime,
              anchorPosition,
              config,
              scheduleTime,
            )
          : plannedStartTime;
        const exitTime = anchorTime !== null && anchorPosition !== null
          ? addDistanceWithSpeed(
              anchorTime,
              Math.max(0, 240 - anchorPosition),
              config,
              scheduleTime,
            )
          : plannedExitTime;
        const endTime = exitTime;
        const clampedDistance = Math.max(0, Math.min(240, distance));
        const calibratedLocation = getCalibratedLocationForLine(lineId, clampedDistance);
        const status =
          !trackingAnchor && currentTime.getTime() < plannedStartTime.getTime()
            ? "未进入"
            : distance > 240
              ? "已出线"
              : "追踪中";

        return {
          id: roll.id,
          lineId,
          batchNumber: roll.batchNumber,
          startTime,
          exitTime,
          endTime,
          distance,
          clampedDistance,
          status,
          currentSlot: calibratedLocation?.slot,
          currentU: calibratedLocation?.uIndex ?? 0,
          inSlotDistance: Math.abs(calibratedLocation?.offsetToU || 0),
          totalSlotLength: 240,
          progress: (clampedDistance / 240) * 100,
          trackingCorrected: Boolean(trackingAnchor),
          correctedAt: anchorTime,
          correctionOffset: trackingAnchor ? distance - plannedDistance : 0,
          anchorSlotId: trackingAnchor?.slotId,
          anchorUIndex: trackingAnchor?.uIndex,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const rank = (item: any) => item.status === "追踪中" ? 0 : item.status === "未进入" ? 1 : 2;
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.startTime.getTime() - b.startTime.getTime();
      }) as Array<{
        id: string;
        lineId: LineId;
        batchNumber?: string;
        startTime: Date;
        exitTime: Date;
        endTime: Date;
        distance: number;
        clampedDistance: number;
        status: string;
        currentSlot?: JointSlotConfig;
        currentU: number;
        inSlotDistance: number;
        totalSlotLength: number;
        progress: number;
        trackingCorrected: boolean;
        correctedAt: Date | null;
        correctionOffset: number;
        anchorSlotId?: string;
        anchorUIndex?: number;
      }>;
  };

  const handleAppLogin = (account: AppAccount) => {
    const normalizedAccount = {
      ...account,
      lines: normalizeLines(account.lines),
    };
    writeLocalStorageWithBackup(SESSION_STORAGE_KEY, normalizedAccount.username);
    setLineConfigs((prev) => mergeLineConfigs(prev, normalizedAccount.lines));
    setLastWashes((prev) => ({
      ...createLineDateMap(normalizedAccount.lines, null),
      ...Object.fromEntries(
        normalizedAccount.lines
          .map((line) => line.id)
          .filter((line) => Object.prototype.hasOwnProperty.call(prev, line))
          .map((line) => [line, prev[line]]),
      ),
    }));
    setRollCompletionInputs(createLineDateMap(normalizedAccount.lines, ""));
    setRollCompletionTimeInputs(createLineDateMap(normalizedAccount.lines, ""));
    setJointCalibrationMarks((prev) => mergeJointCalibrationMarks(prev, normalizedAccount.lines));
    setAppUser(normalizedAccount);
    setSelectedLine(normalizedAccount.lines[0].id);
    setActivePage(normalizedAccount.role === "admin" ? "users" : "dashboard");
  };

  const handleAppLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(`${SESSION_STORAGE_KEY}${LOCAL_BACKUP_SUFFIX}`);
    setAppUser(null);
    setActivePage("dashboard");
  };

  const handleAccountsChange = (nextAccounts: AppAccount[]) => {
    setAccounts(nextAccounts);
    if (appUser) {
      const updatedUser = nextAccounts.find((account) => account.username === appUser.username);
      if (updatedUser) {
        setAppUser(updatedUser);
        setLineConfigs((prev) => mergeLineConfigs(prev, updatedUser.lines));
        setJointCalibrationMarks((prev) => mergeJointCalibrationMarks(prev, updatedUser.lines));
        setSelectedLine((prev) => (
          normalizeLines(updatedUser.lines).some((line) => line.id === prev)
            ? prev
            : normalizeLines(updatedUser.lines)[0].id
        ));
      }
    }
  };

  const handleSaveLineMeter = (lineId: LineId) => {
    const normalizedInput = String(lineMeterInputs[lineId] || "").trim().replace(",", ".");
    const normalizedSpeed = String(lineMeterSpeedInputs[lineId] || "").trim().replace(",", ".");
    const value = Number(normalizedInput);
    const speed = Number(normalizedSpeed);
    if (
      !normalizedInput ||
      !normalizedSpeed ||
      !Number.isFinite(value) ||
      !Number.isFinite(speed) ||
      value < 0 ||
      speed < 0
    ) {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "请输入有效米数和车速" }));
      return;
    }

    const now = new Date();
    const previousReading = lineMeterReadings[lineId];
    const previousLiveValue = previousReading
      ? getLiveLineMeterValue(previousReading, now)
      : null;
    const nextReadings = {
      ...lineMeterReadings,
      [lineId]: {
        value: Number(value.toFixed(2)),
        speed: Number(speed.toFixed(3)),
        updatedAt: now.toISOString(),
      },
    };
    try {
      writeLocalStorageWithBackup(
        getRealtimeMeterStorageKey(appUser.username),
        JSON.stringify(nextReadings),
      );
      setLineMeterReadings(nextReadings);
      setLineMeterInputs((prev) => ({ ...prev, [lineId]: String(nextReadings[lineId].value) }));
      setLineMeterSpeedInputs((prev) => ({ ...prev, [lineId]: String(nextReadings[lineId].speed) }));
      const correction = previousLiveValue === null ? null : value - previousLiveValue;
      const successMessage = correction === null
        ? "首次校对完成"
        : `校对完成，修正 ${correction >= 0 ? "+" : ""}${correction.toFixed(2)}m`;
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: successMessage }));
    } catch {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "保存失败，请检查本地空间" }));
    }
  };

  const handleAdjustLineMeterSpeed = (lineId: LineId) => {
    const normalizedSpeed = String(lineMeterSpeedInputs[lineId] || "").trim().replace(",", ".");
    const speed = Number(normalizedSpeed);
    if (!normalizedSpeed || !Number.isFinite(speed) || speed < 0) {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "请输入有效车速" }));
      return;
    }

    const reading = lineMeterReadings[lineId];
    const now = new Date();
    const liveValue = reading ? getLiveLineMeterValue(reading, now) : null;
    if (liveValue === null) {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "请先同步真实米数" }));
      return;
    }

    const nextReadings = {
      ...lineMeterReadings,
      [lineId]: {
        value: Number(liveValue.toFixed(6)),
        speed: Number(speed.toFixed(3)),
        updatedAt: now.toISOString(),
      },
    };
    try {
      writeLocalStorageWithBackup(
        getRealtimeMeterStorageKey(appUser.username),
        JSON.stringify(nextReadings),
      );
      setLineMeterReadings(nextReadings);
      setLineMeterInputs((prev) => ({ ...prev, [lineId]: liveValue.toFixed(2) }));
      setLineMeterSpeedInputs((prev) => ({ ...prev, [lineId]: String(nextReadings[lineId].speed) }));
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "车速已调整" }));
    } catch {
      setLineMeterMessages((prev) => ({ ...prev, [lineId]: "保存失败，请检查本地空间" }));
    }
  };

  const triggerBackupDownload = (fileName: string, content: string) => {
    const blob = new Blob([content], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const restoreBackupPayload = (payload: any) => {
    if (payload?.app !== "maizhanpiao-foil-planner") {
      throw new Error("Invalid backup file");
    }
    if (payload?.data && typeof payload.data === "object") {
      Object.entries(payload.data as Record<string, string>).forEach(([key, value]) => {
        if (isPortableBackupDataKey(key) && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      });
    }
    if (payload?.kind === "full_snapshot" && payload?.snapshot) {
      const importedAt = payload.exportedAt || new Date().toISOString();
      const snapshotKey = typeof payload.key === "string" && payload.key.startsWith(`${FULL_SNAPSHOT_PREFIX}:`)
        ? payload.key
        : `${FULL_SNAPSHOT_PREFIX}:${payload.snapshot.username || appUser.username}:${format(new Date(importedAt), "yyyy-MM-dd-HHmmss")}`;
      try {
        localStorage.setItem(snapshotKey, JSON.stringify(payload, null, 2));
      } catch {
        setLocalBackupMessage("备份内容已恢复，但手机本地空间不足，未能把该版本再次存入版本列表。");
      }
      if (payload.snapshot.dateKey) {
        const lineStateKey = getLocalLineStateKey(appUser.username, payload.snapshot.dateKey);
        writeLocalStorageWithBackup(lineStateKey, JSON.stringify({
          lineConfigs: payload.snapshot.lineConfigs,
          activeSplicing: payload.snapshot.activeSplicing,
          lastWashes: payload.snapshot.lastWashes,
          jointSlotConfigs: payload.snapshot.jointSlotConfigs,
          jointCalibrationMarks: payload.snapshot.jointCalibrationMarks,
          punchRecords: payload.snapshot.punchRecords,
          savedAt: importedAt,
        }));
      }
    }
  };

  const handleSaveFullSnapshot = () => {
    const data: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !isPortableBackupDataKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }

    const exportedAt = new Date().toISOString();
    const snapshot = {
      username: appUser.username,
      dateKey,
      savedAt: exportedAt,
      currentTime: currentTime.toISOString(),
      scheduleTime: scheduleTime.toISOString(),
      lineConfigs,
      activeSplicing,
      lastWashes,
      jointSlotConfigs,
      jointCalibrationMarks,
      punchRecords,
    };

    const payload = {
      app: "maizhanpiao-foil-planner",
      version: 2,
      kind: "full_snapshot",
      exportedAt,
      key: "",
      snapshot,
      data,
    };
    const snapshotKey = `${FULL_SNAPSHOT_PREFIX}:${appUser.username}:${format(new Date(), "yyyy-MM-dd-HHmmss")}`;
    payload.key = snapshotKey;
    const serialized = JSON.stringify(payload, null, 2);
    const fileName = `maizhanpiao-backup-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`;
    setBackupCopyStatus("idle");
    setBackupExportDialog({ fileName, content: serialized });
    try {
      localStorage.setItem(snapshotKey, serialized);
      setLocalBackupMessage("已生成完整备份，请在弹窗里选择保存方式。");
    } catch {
      setLocalBackupMessage("已生成完整备份，但手机本地空间不足，未加入版本列表。请在弹窗里保存到文件或复制文本。");
    }
  };

  const handleImportLocalBackup = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        restoreBackupPayload(payload);
        setLocalBackupMessage("备份已导入，页面正在刷新。");
        window.setTimeout(() => window.location.reload(), 500);
      } catch {
        setLocalBackupMessage("导入失败：请选择本工具导出的备份 JSON。");
      } finally {
        if (localBackupInputRef.current) localBackupInputRef.current.value = "";
      }
    });
    reader.readAsText(file);
  };

  const handleImportBackupText = () => {
    try {
      const payload = JSON.parse(backupImportText.trim());
      restoreBackupPayload(payload);
      setLocalBackupMessage("备份文本已导入，页面正在刷新。");
      setShowBackupTextImport(false);
      setBackupImportText("");
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setLocalBackupMessage("导入失败：请粘贴完整的备份 JSON 文本。");
    }
  };

  const selectAllBackupText = () => {
    const textarea = backupExportTextRef.current;
    if (!textarea) return;
    const selectAll = () => {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    };
    selectAll();
    window.requestAnimationFrame(selectAll);
    window.setTimeout(selectAll, 80);
  };

  const handleCopyBackupText = async () => {
    if (!backupExportDialog) return;
    const text = backupExportDialog.content;
    const markManualCopy = () => {
      selectAllBackupText();
      setBackupCopyStatus("manual");
      setLocalBackupMessage("复制没有自动完成：已自动全选所有备份文字，请手动复制后粘贴保存。");
    };

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      const copied = await navigator.clipboard
        .readText?.()
        .then((value) => value === text)
        .catch(() => true);
      if (!copied) throw new Error("Clipboard verification failed");
      setBackupCopyStatus("success");
      setLocalBackupMessage("备份文本已复制，可以粘贴到备忘录或微信文件助手保存。");
    } catch {
      selectAllBackupText();
      try {
        const ok = document.execCommand("copy");
        if (ok) {
          setBackupCopyStatus("success");
          setLocalBackupMessage("备份文本已复制，可以粘贴到备忘录或微信文件助手保存。");
          return;
        }
        markManualCopy();
      } catch {
        setBackupCopyStatus("error");
        markManualCopy();
      }
    }
  };

  const handleShareBackup = async () => {
    if (!backupExportDialog) return;
    try {
      const file = new File([backupExportDialog.content], backupExportDialog.fileName, {
        type: "application/json",
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "化成箔规划完整备份",
          text: "保存这份 JSON，之后可在工具里恢复完整规划数据。",
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: "化成箔规划完整备份",
          text: backupExportDialog.content,
        });
      } else {
        await navigator.clipboard.writeText(backupExportDialog.content);
        setLocalBackupMessage("当前浏览器不支持系统分享，已尝试复制备份文本。");
      }
    } catch {
      setLocalBackupMessage("分享没有完成。可以改用复制备份文本。");
    }
  };

  const handleSaveBackupToDevice = async () => {
    if (!backupExportDialog) return;
    const picker = (window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }).showSaveFilePicker;

    if (!picker) {
      setLocalBackupMessage("当前浏览器不支持直接选择文件夹保存，已打开系统分享，请选择“存储到文件”。");
      await handleShareBackup();
      return;
    }

    try {
      const fileHandle = await picker({
        suggestedName: backupExportDialog.fileName,
        types: [
          {
            description: "JSON 备份文件",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([backupExportDialog.content], { type: "application/json" }));
      await writable.close();
      setLocalBackupMessage("备份文件已保存到你选择的位置。");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setLocalBackupMessage("没有完成保存。可以改用系统分享或复制文本。");
      }
    }
  };

  if (!appUser) {
    return <AppLoginScreen accounts={accounts} onLogin={handleAppLogin} />;
  }

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

            <button onClick={handleAppLogout} className="mr-2 text-xs text-blue-200 text-left">
              退出 {appUser.username}
            </button>
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
              onClick={() => { setActivePage("daily_record"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "daily_record"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Calculator size={16} /> 当天独立数据记录
            </button>
            {appUser.role === "admin" && (
              <button
                onClick={() => { setActivePage("users"); setIsMobileMenuOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                  activePage === "users"
                    ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                    : "hover:bg-slate-800 text-slate-300 hover:text-white",
                )}
              >
                <Database size={16} /> 用户分配
              </button>
            )}
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
            <button
              onClick={() => { setActivePage("line_meters"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "line_meters"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Gauge size={16} /> 实时米数
            </button>
            <button
              onClick={() => { setActivePage("joint_tracking"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "joint_tracking"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Activity size={16} /> 接头动态追踪
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={handleSaveFullSnapshot}
              className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-200 bg-emerald-900/50 hover:bg-emerald-900 rounded-lg px-2 py-2"
              type="button"
            >
              <Download size={13} /> 保存完整备份
            </button>
            <button
              onClick={() => localBackupInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-blue-200 bg-blue-900/50 hover:bg-blue-900 rounded-lg px-2 py-2"
              type="button"
            >
              <Upload size={13} /> 恢复
            </button>
            <button
              onClick={() => setShowBackupTextImport(true)}
              className="col-span-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-100 bg-amber-900/50 hover:bg-amber-900 rounded-lg px-2 py-2"
              type="button"
            >
              <FileText size={13} /> 粘贴备份文本恢复
            </button>
            <input
              ref={localBackupInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => handleImportLocalBackup(event.target.files?.[0])}
            />
          </div>
          {localBackupMessage && (
            <div className="mt-2 text-[10px] leading-snug font-bold text-slate-400">
              {localBackupMessage}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden max-w-[1600px] w-full relative">
        {activePage === "users" ? (
          <UserAssignmentPage
            accounts={accounts}
            currentUsername={appUser.username}
            onOpenMenu={() => setIsMobileMenuOpen(true)}
            onLogout={handleAppLogout}
            onAccountsChange={handleAccountsChange}
          />
        ) : activePage === "dashboard" ? (
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
            <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Menu size={24} />
                </button>
                <div>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                    执行看板
                  </h2>
                </div>
              </div>
            </header>

            <div className="mb-2 grid shrink-0 grid-cols-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              {activeLines.map((lineId, index) => {
                const reading = lineMeterReadings[lineId] || {
                  value: null,
                  speed: null,
                  updatedAt: null,
                };
                const comparisonTime = new Date();
                const actualValue = getLiveLineMeterValue(reading, comparisonTime);
                const plannedValue = getPlannedLiveMeterValue(
                  lineConfigs[lineId],
                  scheduleTime,
                  comparisonTime,
                );
                const deviation = actualValue !== null && plannedValue !== null
                  ? actualValue - plannedValue
                  : null;
                const hasLargeDeviation = deviation !== null && Math.abs(deviation) > 3;
                return (
                  <button
                    key={lineId}
                    type="button"
                    onClick={() => setActivePage("line_meters")}
                    className={cn(
                      "flex min-w-0 items-baseline justify-center gap-1 px-1 py-1.5 transition-colors",
                      hasLargeDeviation
                        ? "bg-red-50 text-red-700 hover:bg-red-100"
                        : "text-slate-600 hover:bg-slate-50",
                      index < activeLines.length - 1 && (hasLargeDeviation ? "border-r border-red-200" : "border-r border-slate-200"),
                    )}
                    title={
                      deviation === null
                        ? `${lineId}号线实际米数`
                        : `${lineId}号线规划 ${plannedValue?.toFixed(2)}m，偏差 ${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}m`
                    }
                  >
                    <span className={cn("shrink-0 text-[10px] font-black", hasLargeDeviation ? "text-red-600" : "text-slate-500")}>
                      {lineId}#
                    </span>
                    <span className={cn("truncate font-mono text-xs font-black", hasLargeDeviation ? "text-red-700" : "text-slate-900")}>
                      {actualValue === null ? "--" : actualValue.toFixed(1)}
                    </span>
                    <span className={cn("shrink-0 text-[9px] font-bold", hasLargeDeviation ? "text-red-500" : "text-slate-400")}>
                      m
                    </span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const trackingJoints = activeLines.flatMap((lineId) => {
                const joint = getJointTrackingForLine(lineId).find(
                  (item) => item.status === "追踪中",
                );
                return joint ? [joint] : [];
              });
              if (trackingJoints.length === 0) return null;

              return (
                <div className="mb-4 flex shrink-0 gap-1.5">
                  {trackingJoints.map((joint) => {
                    const locationLabel = joint.currentSlot
                      ? `${joint.currentSlot.name}${joint.currentU > 0 ? ` · ${getJointPointLabel(joint.currentSlot, joint.currentU)}` : ""}`
                      : "位置待确认";
                    return (
                      <button
                        key={`${joint.lineId}-${joint.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedLine(joint.lineId);
                          setActivePage("joint_tracking");
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-2 text-left text-orange-900 shadow-sm transition-colors hover:bg-orange-100"
                        title={`${joint.lineId}号线当前接头：${locationLabel}，${joint.clampedDistance.toFixed(1)}米`}
                      >
                        <MapPin size={13} className="shrink-0 text-orange-600" />
                        <span className="shrink-0 text-[10px] font-black">{joint.lineId}#</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] font-black">
                          {locationLabel}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] font-black text-orange-700">
                          {joint.clampedDistance.toFixed(1)}m
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

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
                        type: 'completed' | 'plan' | 'joint_prep';
                        length: number;
                        isJoint?: boolean;
                        frontStartTime?: Date;
                      };

                      let allEvents: TimelineEvent[] = [];

                      activeLines.forEach(lineId => {
                        const mappedRolls = getComputedPlanForLine(lineId);
                        
                        if (!isPlanningMode) {
                          const completedRolls = getUnloadedCompletedRolls(lineConfigs[lineId].completedRolls || []);
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
                        }

                        mappedRolls.forEach(r => {
                          const t = r.endTime;
                          let frontStartTime: Date | undefined;
                          if (r.isJoint) {
                            frontStartTime = addSignedDistanceWithSpeed(
                              scheduleTime,
                              r.cumulativeCorrosion - 240,
                              lineConfigs[lineId],
                              scheduleTime,
                            );
                          }

                          if (t.getTime() >= shiftS.getTime() && t.getTime() <= shiftE.getTime()) {
                            allEvents.push({
                              id: `p-${lineId}-${r.id}`,
                              time: t,
                              lineId,
                              type: 'plan',
                              length: r.targetFormedLength,
                              isJoint: r.isJoint,
                              frontStartTime
                            });
                          }

                          if (frontStartTime && frontStartTime.getTime() >= shiftS.getTime() && frontStartTime.getTime() <= shiftE.getTime()) {
                            allEvents.push({
                              id: `jp-${lineId}-${r.id}-front`,
                              time: frontStartTime,
                              lineId,
                              type: 'joint_prep',
                              length: 0,
                              isJoint: true,
                            });
                          }
                        });
                      });

                      allEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

                      if (allEvents.length === 0) {
                        return <div className="text-sm text-slate-400 italic pl-12 text-center py-4">当前班次无分卷任务</div>;
                      }

                      const pastEvents = allEvents.filter(
                        (evt) => evt.time.getTime() < currentTime.getTime(),
                      );
                      const visibleEvents = showPastShiftEvents
                        ? allEvents
                        : allEvents.filter((evt) => evt.time.getTime() >= currentTime.getTime());

                      return (
                        <>
                          {pastEvents.length > 0 && (
                            <div className="relative z-20 mb-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-12">
                              <div className="min-w-0">
                                <div className="text-[11px] font-black text-slate-700">
                                  已过时间任务
                                </div>
                                <div className="text-[10px] font-bold text-slate-400">
                                  {showPastShiftEvents
                                    ? `已展开 ${pastEvents.length} 项，可回顾本班次全部计划`
                                    : `已折叠 ${pastEvents.length} 项，当前只显示后续任务`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowPastShiftEvents((prev) => !prev)}
                                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 shadow-sm active:scale-95"
                              >
                                <ChevronRight
                                  size={13}
                                  className={cn(
                                    "transition-transform",
                                    showPastShiftEvents && "rotate-90",
                                  )}
                                />
                                {showPastShiftEvents ? "收起" : "展开"}
                              </button>
                            </div>
                          )}

                          {visibleEvents.length === 0 ? (
                            <div className="relative z-10 py-6 pl-12 text-center text-sm font-bold text-emerald-600">
                              本班次剩余任务已全部完成
                            </div>
                          ) : (
                            visibleEvents.map((evt) => {
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
                                  evt.type === 'joint_prep' ? "bg-orange-500 border-orange-100" : (
                                    evt.isJoint ? "bg-orange-500 border-orange-100" : "bg-blue-500 border-blue-100"
                                  )
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
                              ) : evt.type === 'joint_prep' ? (
                                <div className="flex items-center bg-orange-50/80 border border-orange-200 rounded-xl px-4 py-3 gap-3 shadow-sm hover:shadow transition-shadow">
                                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center font-black text-orange-700">
                                    {evt.lineId}#
                                  </div>
                                  <div className="flex-1 flex flex-col">
                                    <span className="text-orange-600 font-bold text-[13px] self-start flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                      接箔 (接头前处理)
                                    </span>
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
                                      <div className="flex flex-col gap-1.5 self-start mb-0.5">
                                        <div className="flex items-center gap-1.5 self-start">
                                          <span className="text-white font-bold text-xs px-2 py-0.5 rounded shadow-sm bg-gradient-to-r from-orange-500 to-red-500 animate-pulse">接头分卷</span>
                                        </div>
                                        {evt.frontStartTime && (
                                          <div className="text-[10px] text-orange-600 font-bold bg-orange-100/80 px-1.5 py-0.5 rounded shadow-sm self-start whitespace-nowrap">
                                            {format(evt.frontStartTime, "HH:mm")} 接箔
                                          </div>
                                        )}
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
                            })
                          )}
                        </>
                      );
                    })()}
                  </div>
                </section>
              {/* Tactical Action Terminal (Right Column) */}
              <div className={cn(
                "flex flex-col shrink-0 h-auto transition-all",
                showWorkbenchControls
                  ? "overflow-hidden bg-slate-900 rounded-2xl shadow-xl border border-slate-800 min-h-[500px]"
                  : "items-end overflow-visible bg-transparent border-0 shadow-none min-h-0",
              )}>
                <div className={cn(
                  "shrink-0",
                  showWorkbenchControls
                    ? "p-3 border-b border-slate-800"
                    : "p-0 flex justify-end",
                )}>
                  <button
                    type="button"
                    onClick={() => setShowWorkbenchControls((prev) => !prev)}
                    className={cn(
                      "transition-all active:scale-[0.98]",
                      showWorkbenchControls
                        ? "mb-3 flex w-full items-center justify-between gap-3 rounded-xl bg-slate-800/70 px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                        : "inline-flex h-7 w-7 items-center justify-center text-slate-300 hover:text-slate-600",
                    )}
                    aria-label={showWorkbenchControls ? "收起操作区" : "展开操作区"}
                  >
                    {showWorkbenchControls ? (
                      <>
                        <span className="min-w-0">
                          <span className="block text-xs font-black">
                            {selectedLine}# 线操作区
                          </span>
                          <span className="block text-[10px] font-bold text-slate-500">
                            参数设置与过架子提醒
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-black text-blue-300">
                          <ChevronRight size={14} className="rotate-90 transition-transform" />
                          收起
                        </span>
                      </>
                    ) : (
                      <ChevronRight size={18} strokeWidth={3} />
                    )}
                  </button>

                  {showWorkbenchControls && (
                    <div className="bg-slate-950 p-1.5 rounded-xl flex gap-1">
                      {activeLines.map((line) => (
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
                  )}
                </div>

                {/* Tab Content Area */}
                {showWorkbenchControls && (
                  <div className="p-6 flex-1 overflow-y-auto bg-slate-900/50 hide-scrollbar">
	                  {/* Tab: Plan */}
	                  {activeTab === "plan" && (
	                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
	                      <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700">
	                        <div className="mb-4">
		                          <h4 className="text-sm font-bold text-slate-200">
		                            过架子提醒
		                          </h4>
		                          <p className="text-[10px] text-slate-400 mt-1">
		                            接箔前端处理完成后，点击按钮直接启动 {getRackCountdownMinutes(selectedLine)} 分钟过架子倒计时。
		                          </p>
	                        </div>

	                        {(() => {
	                          const task = updatedSplicingTasks
	                            .filter((item) => item.line === selectedLine && item.status !== "done")
	                            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
	                          if (!task) return null;

	                          return (
	                            <div className="mb-4 rounded-xl bg-slate-950/60 border border-orange-500/30 p-3">
		                              <div className="flex items-center justify-between gap-3 mb-2">
		                                <div>
		                                  <div className="text-[10px] font-black text-slate-500">
		                                    {selectedLine}# 线过架子提醒
		                                  </div>
	                                  <div className={cn(
	                                    "text-sm font-black mt-0.5",
	                                    task.urgency === "critical"
	                                      ? "text-red-300"
	                                      : task.urgency === "warning"
	                                        ? "text-orange-300"
	                                        : "text-blue-200",
	                                  )}>
	                                    {task.displayStatus}
	                                  </div>
	                                </div>
		                                <div className="text-right font-mono">
		                                  <div className="text-lg font-black text-white">
		                                    {task.rackTimerDueAt && !task.rackAlarmAcknowledged
		                                      ? `${Math.max(0, task.rackRemainingMinutes ?? 0)}m`
		                                      : `${Math.max(0, task.minElapsed)}m`}
		                                  </div>
		                                  <div className="text-[10px] font-bold text-slate-500">
		                                    {task.rackTimerDueAt && !task.rackAlarmAcknowledged ? "剩余" : "已过"}
		                                  </div>
	                                </div>
	                              </div>
	                              <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
	                                <div
	                                  className={cn(
	                                    "h-full transition-all",
	                                    task.urgency === "critical"
	                                      ? "bg-red-500"
	                                      : task.urgency === "warning"
	                                        ? "bg-orange-500"
	                                        : "bg-blue-500",
	                                  )}
	                                  style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
	                                />
	                              </div>
	                              {task.status === "splicing" && task.minElapsed >= 30 && (
	                                <button
	                                  type="button"
	                                  onClick={() => handleStartRackCountdown(task.id)}
	                                  className="mt-3 w-full rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-2 text-xs font-black text-white"
	                                >
	                                  已接好，开始过架子{getRackCountdownMinutes(task.line)}分钟倒计时
	                                </button>
	                              )}
	                              {task.rackTimerDueAt && !task.rackAlarmAcknowledged && (
	                                <button
	                                  type="button"
	                                  onClick={() => handleAcknowledgeRackAlarm(task.id)}
	                                  className="mt-3 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-black text-white"
	                                >
	                                  已准备好，取消提醒
	                                </button>
	                              )}
	                            </div>
	                          );
	                        })()}

	                        <button
	                          onClick={() => handleConfirmJointPrepComplete(selectedLine, `manual-rack-${Date.now()}`)}
	                          className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] active:scale-95 flex items-center justify-center gap-2"
	                          >
	                            <Scissors size={18} />
	                            已处理好，开始过架子{getRackCountdownMinutes(selectedLine)}分钟倒计时
	                          </button>
	                      </div>

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
                                    onChange={(e) => {
                                      const rawValue = e.target.value.trim();
                                      const nextTotal = Number(rawValue);
                                      if (rawValue === "" || !Number.isFinite(nextTotal) || nextTotal <= 0) {
                                        clearLineProductionData(selectedLine);
                                        return;
                                      }
                                      setLineConfigs((p) => ({
                                        ...p,
                                        [selectedLine]: {
                                          ...p[selectedLine],
                                          cTotal: nextTotal,
                                          cUsed: Math.min(p[selectedLine].cUsed || 0, nextTotal),
                                          cPrevUsed: Math.min(p[selectedLine].cPrevUsed || 0, nextTotal),
                                          rolls: [],
                                        },
                                      }));
                                      setActiveSplicing((prev) => prev.filter((task) => task.line !== selectedLine));
                                      setRollTargetDrafts((prev) =>
                                        Object.fromEntries(
                                          Object.entries(prev).filter(([key]) => !key.startsWith(`${selectedLine}:`)),
                                        ),
                                      );
                                    }}
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
                                getManualUnloadedLength(lineConfigs[selectedLine].completedRolls || [])
                              }
                              cMineUnrolled={
                                lineConfigs[selectedLine].completedRolls?.filter(cr => !cr.isManual).reduce(
                                  (acc, cr) => acc + getCompletedRollCorrosionConsumed(cr),
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
                                  <div key={fr.id} className="grid grid-cols-[auto_minmax(0,1fr)_110px_auto] items-end gap-2 text-xs bg-slate-900/50 rounded px-2.5 py-2 border border-slate-700/50">
                                    <span className="text-slate-500 font-bold font-mono pb-2">#{idx + 1}</span>
                                    <label className="min-w-0">
                                      <span className="block text-[9px] text-slate-500 font-bold mb-1">批号</span>
                                      <input
                                        type="text"
                                        value={fr.batchNo}
                                        onChange={(e) =>
                                          handleUpdateFutureRoll(selectedLine, fr.id, {
                                            batchNo: e.target.value,
                                          })
                                        }
                                        placeholder="未填写"
                                        className="w-full bg-slate-950/70 border border-slate-700 rounded px-2 py-1.5 text-slate-200 font-mono outline-none focus:border-blue-400"
                                      />
                                    </label>
                                    <label>
                                      <span className="block text-[9px] text-slate-500 font-bold mb-1">总长(m)</span>
                                      <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={fr.length || ""}
                                        onChange={(e) => {
                                          if (e.target.value === "") return;
                                          const nextLength = Number(e.target.value);
                                          if (!Number.isFinite(nextLength) || nextLength <= 0) return;
                                          handleUpdateFutureRoll(selectedLine, fr.id, {
                                            length: nextLength,
                                          });
                                        }}
                                        className="w-full bg-slate-950/70 border border-slate-700 rounded px-2 py-1.5 text-emerald-400 font-mono outline-none focus:border-blue-400"
                                      />
                                    </label>
                                    <div className="pb-0.5">
                                      <button
                                        onClick={() => handleRemoveFutureRoll(fr.id)}
                                        className="text-red-300 hover:text-white bg-red-950/40 hover:bg-red-600/80 border border-red-500/30 transition-colors p-2 rounded-lg"
                                        title="删除该排队腐蚀箔"
                                        type="button"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
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
                                {getManualCompletedRolls(lineConfigs[selectedLine].completedRolls || [])
                                  .length || 0}{" "}
                                卷
                              </span>
                            </button>

                            {showCompletedRolls && (
                              <div className="mt-2 pl-[18px] border-l-2 border-slate-700/50 mb-4 animate-in fade-in slide-in-from-top-1">
                                <div className="text-[10px] text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2 mb-2 font-bold">
                                  最后一条米数视为仍在生产线上的当前卷，不会按已卸卷处理。
                                </div>
                                <div className="space-y-2">
                                  {lineConfigs[
                                    selectedLine
                                  ].completedRolls?.filter(cr => cr.isManual).map((cr) => (
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
                                              
                                              newConfig[selectedLine] = applyCompletedRollAccounting(p[selectedLine], updatedRolls);
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

                                            newConfig[selectedLine] = applyCompletedRollAccounting(p[selectedLine], updatedRolls);
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

                                      newConfig[selectedLine] = applyCompletedRollAccounting(p[selectedLine], updatedRolls);
                                      return newConfig;
                                    });
                                  }}
                                  className="mt-2 flex items-center gap-1 text-[10px] text-blue-400 font-bold hover:text-blue-300 transition-colors uppercase tracking-wider"
                                >
                                  <Plus size={12} /> 添加化成箔记录
                                </button>

                                {getManualCompletedRolls(lineConfigs[selectedLine].completedRolls || [])
                                  .length === 0 && (
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
                            <div className="flex items-center justify-between gap-3">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">
                                车速设置(m/min)
                              </label>
                              <span className="text-[10px] font-black text-blue-300">
                                当前生效 {getSpeedAtTime(lineConfigs[selectedLine], currentTime, scheduleTime).toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                step="0.01"
                                value={lineSpeedDrafts[selectedLine] ?? String(lineConfigs[selectedLine].speed || "")}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  const nextSpeed = parsePositiveDecimalInput(nextValue);
                                  setLineSpeedDrafts((prev) => ({ ...prev, [selectedLine]: nextValue }));
                                  if (nextSpeed !== null) {
                                    setLineConfigs((p) => ({
                                      ...p,
                                      [selectedLine]: {
                                        ...p[selectedLine],
                                        speed: Number(nextSpeed.toFixed(3)),
                                      },
                                    }));
                                  }
                                }}
                                onBlur={() =>
                                  setLineSpeedDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[selectedLine];
                                    return next;
                                  })
                                }
                                onFocus={(event) => event.currentTarget.select()}
                                className="min-w-0 bg-slate-900 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-white font-mono"
                              />
                              <span className="text-[10px] font-bold text-slate-500">班次开始默认</span>
                            </div>
                            <div className="mt-2 space-y-2">
                              {(lineConfigs[selectedLine].speedSegments || [])
                                .slice()
                                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                .map((segment, index, sortedSegments) => (
                                  <div
                                    key={segment.id}
                                    className="grid grid-cols-[96px_minmax(0,1fr)_32px] gap-2 items-center rounded-lg border border-slate-700/50 bg-slate-900/60 p-2"
                                  >
                                    <input
                                      type="time"
                                      value={segment.startTime}
                                      onChange={(e) =>
                                        setLineConfigs((p) => ({
                                          ...p,
                                          [selectedLine]: {
                                            ...p[selectedLine],
                                            speedSegments: (p[selectedLine].speedSegments || []).map((item) =>
                                              item.id === segment.id
                                                ? { ...item, startTime: e.target.value }
                                                : item,
                                            ),
                                          },
                                        }))
                                      }
                                      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white font-mono"
                                    />
                                    <div className="min-w-0 flex items-center gap-2">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        step="0.01"
                                        value={segmentSpeedDrafts[`${selectedLine}:${segment.id}`] ?? String(segment.speed || "")}
                                        onChange={(e) => {
                                          const draftKey = `${selectedLine}:${segment.id}`;
                                          const nextValue = e.target.value;
                                          const nextSpeed = parsePositiveDecimalInput(nextValue);
                                          setSegmentSpeedDrafts((prev) => ({ ...prev, [draftKey]: nextValue }));
                                          if (nextSpeed !== null) {
                                            setLineConfigs((p) => ({
                                              ...p,
                                              [selectedLine]: {
                                                ...p[selectedLine],
                                                speedSegments: (p[selectedLine].speedSegments || []).map((item) =>
                                                  item.id === segment.id
                                                    ? { ...item, speed: Number(nextSpeed.toFixed(3)) }
                                                    : item,
                                                ),
                                              },
                                            }));
                                          }
                                        }}
                                        onBlur={() =>
                                          setSegmentSpeedDrafts((prev) => {
                                            const next = { ...prev };
                                            delete next[`${selectedLine}:${segment.id}`];
                                            return next;
                                          })
                                        }
                                        onFocus={(event) => event.currentTarget.select()}
                                        className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white font-mono"
                                      />
                                      <span className="hidden sm:inline text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                        至 {sortedSegments[index + 1]?.startTime || "后续"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLineConfigs((p) => ({
                                          ...p,
                                          [selectedLine]: {
                                            ...p[selectedLine],
                                            speedSegments: (p[selectedLine].speedSegments || []).filter(
                                              (item) => item.id !== segment.id,
                                            ),
                                          },
                                        }))
                                      }
                                      className="h-9 w-8 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 flex items-center justify-center"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              <button
                                type="button"
                                onClick={() =>
                                  setLineConfigs((p) => ({
                                    ...p,
                                    [selectedLine]: {
                                      ...p[selectedLine],
                                      speedSegments: [
                                        ...(p[selectedLine].speedSegments || []),
                                        {
                                          id: Math.random().toString(),
                                          startTime: format(currentTime, "HH:mm"),
                                          speed: getSpeedAtTime(p[selectedLine], currentTime, scheduleTime),
                                        },
                                      ],
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] font-black text-blue-300 hover:bg-blue-500/20"
                              >
                                + 添加变速时间段
                              </button>
                              <p className="text-[10px] leading-relaxed text-slate-500">
                                例如 10:00 填 1.10，表示从 10:00 起按 1.10 计算，直到下一条变速记录。
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              handleGlobalGeneratePlan();
                              setPlanSuccess(true);
                              setTimeout(() => setPlanSuccess(false), 2500);
                              handleSavePlan();
                            }}
                            className={cn(
                              "flex-1 py-3 text-white font-black text-[13px] rounded-xl transition-all shadow-lg flex justify-center items-center gap-2",
                              saveSuccess || planSuccess
                                ? "bg-emerald-500 shadow-emerald-900/30"
                                : "bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                            )}
                          >
                            {saveSuccess ? (
                              <>
                                <CheckSquare size={16} /> 已保存排产
                              </>
                            ) : planSuccess ? (
                              <>
                                <CheckSquare size={16} /> 已排产
                              </>
                            ) : (
                              <>
                                <Route size={16} /> 排产
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(() => {
                          const computed = getComputedPlanForLine(selectedLine);
                          const totalReq = getPlannedCorrosionDemand(lineConfigs[selectedLine]);
                          const totalTarget = computed.reduce(
                            (acc, r) => acc + r.corrosionConsumed,
                            0,
                          );
                          const gap = totalReq - totalTarget;

                          if (computed.length === 0) return null;

                          const shiftStart = getCurrentShiftStart(scheduleTime);
                          const shiftEnd = getCurrentShiftEnd(scheduleTime);
                          const maxMinutes = differenceInMinutes(shiftEnd, shiftStart);

                          const itemsToRender = computed;

                          return (
                            <>
                              <div className="flex justify-between items-center px-1">
                                <span className="text-xs font-bold text-slate-400">
                                  规划结果 (显示全部 {computed.length} 卷)
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
                                const draftKey = `${selectedLine}:${r.id}`;
                                const draftValue = rollTargetDrafts[draftKey];
                                const commitTargetDraft = () => {
                                  const nextTarget = parsePositiveDecimalInput(
                                    draftValue ?? String(r.targetFormedLength),
                                  );
                                  setRollTargetDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[draftKey];
                                    return next;
                                  });
                                  if (nextTarget === null || nextTarget === r.targetFormedLength) return;
                                  setLineConfigs((p) => ({
                                    ...p,
                                    [selectedLine]: updateRollTargetWithBorrow(p[selectedLine], i, nextTarget),
                                  }));
                                };
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
                                          {i === 0 && getFirstRollCarryIn(lineConfigs[selectedLine]) > 0 && (
                                            <span className="text-[10px] text-slate-400 mt-0.5">
                                              含接班已收 {getFirstRollCarryIn(lineConfigs[selectedLine]).toFixed(1)}m
                                            </span>
                                          )}
                                          {r.endTime && differenceInMinutes(r.endTime, shiftStart) > maxMinutes && (
                                            <span className="text-[10px] text-amber-500 mt-0.5">
                                              部分或全部在下班产
                                            </span>
                                          )}
                                          {r.isWarning && (
                                            <span className="text-[10px] text-amber-400 mt-0.5">
                                              特殊米数，已允许
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={draftValue ?? String(r.targetFormedLength)}
                                          onChange={(event) => {
                                            const nextValue = event.currentTarget.value;
                                            setRollTargetDrafts((prev) => ({
                                              ...prev,
                                              [draftKey]: nextValue,
                                            }));
                                          }}
                                          onBlur={commitTargetDraft}
                                          onFocus={(event) => {
                                            const nextValue = event.currentTarget.value;
                                            setRollTargetDrafts((prev) => ({
                                              ...prev,
                                              [draftKey]: nextValue,
                                            }));
                                            event.currentTarget.select();
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              event.currentTarget.blur();
                                            }
                                            if (event.key === "Escape") {
                                              setRollTargetDrafts((prev) => {
                                                const next = { ...prev };
                                                delete next[draftKey];
                                                return next;
                                              });
                                              event.currentTarget.blur();
                                            }
                                          }}
                                          className={cn(
                                            "w-20 bg-slate-950 border rounded p-1 text-center font-mono text-sm font-bold text-white outline-none",
                                            r.isWarning
                                              ? "border-amber-500/70 focus:border-amber-400"
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
                                          Math.max(0, differenceInMinutes(r.endTime, r.startTime)),
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
                        <div className="flex justify-end mb-4">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer hover:text-white transition-colors">
                            <input
                              type="checkbox"
                              checked={showOnlyJointPrep}
                              onChange={(e) => setShowOnlyJointPrep(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            只看接头前处理
                          </label>
                        </div>
                        {/* Forecast Timeline */}
                        <div className="space-y-12">
                          {(() => {
                            const lineId = selectedLine;
                            const conf = lineConfigs[lineId];
                            const currentRem = getCurrentCorrosionRemaining(conf);
                            const machineLen = 240;
                            let accDistance = currentRem;

                            // Current Roll
                            const currentRunOutDate = addDistanceWithSpeed(currentTime, accDistance, conf, scheduleTime);
                            const currentEmergeDate = addDistanceWithSpeed(currentTime, accDistance + machineLen, conf, scheduleTime);

                            const nextRollsList = [];

                            const futureRolls = conf.futureRolls || [];
                            for (let i = 0; i < futureRolls.length; i++) {
                              const fr = futureRolls[i];
                              const startInTime = addDistanceWithSpeed(currentTime, accDistance, conf, scheduleTime);
                              const startOutTime = addDistanceWithSpeed(currentTime, accDistance + machineLen, conf, scheduleTime);

                              accDistance += fr.length;
                              const endInTime = addDistanceWithSpeed(currentTime, accDistance, conf, scheduleTime);
                              const endOutTime = addDistanceWithSpeed(currentTime, accDistance + machineLen, conf, scheduleTime);

                              nextRollsList.push({
                                ...fr,
                                startInTime,
                                startOutTime,
                                endInTime,
                                endOutTime,
                              });
                            }

                            const fb = forecastBatches[lineId] || "";
                            const fl = forecastLengths[lineId] || "";

                            return (
                              <div key={lineId} className="flex flex-col gap-3 relative">
                                <h4 className="text-lg font-black text-white border-b border-slate-700/50 pb-3 mb-2 flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                                  {lineId}# 生产线预测
                                </h4>
                                <div className="absolute left-[3px] top-12 bottom-4 w-[2px] bg-slate-700/50"></div>

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
                                    <div className={`grid gap-2 mt-3 ${showOnlyJointPrep ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                                      {!showOnlyJointPrep && (
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
                                      )}
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
                                        <div className={`grid gap-2 opacity-90 group-hover:opacity-100 transition-opacity ${showOnlyJointPrep ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                                          {!showOnlyJointPrep && (
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
                                          )}
                                        </div>
                                        <div className={`grid gap-2 opacity-90 group-hover:opacity-100 transition-opacity ${showOnlyJointPrep ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                                          {!showOnlyJointPrep && (
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
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
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
	                            过架子提醒
	                          </h4>
	                          <p className="text-[10px] text-slate-400 mt-1">
	                            接箔前端处理完成后，点击按钮直接启动 {getRackCountdownMinutes(selectedLine)} 分钟过架子倒计时。
	                          </p>
                        </div>

	                        <button
	                          onClick={() => handleConfirmJointPrepComplete(selectedLine, `manual-rack-${Date.now()}`)}
	                          className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] active:scale-95 flex items-center justify-center gap-2"
	                          >
	                            <Scissors size={18} />
	                            已处理好，开始过架子{getRackCountdownMinutes(selectedLine)}分钟倒计时
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
                          <li>接箔后需过架子：24/25# 线按 15 分钟提醒，26# 线按 25 分钟提醒。</li>
                        </ul>
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
                )}
              </div>


              </div>

            </div>
          </div>
        ) : activePage === "line_meters" ? (
          <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:rounded-2xl sm:border sm:border-slate-200 sm:p-6">
            <div className="mx-auto w-full max-w-5xl">
              <div className="mb-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActivePage("dashboard")}
                  className="lg:hidden -ml-2 flex shrink-0 items-center gap-1 rounded-lg p-2 text-slate-600 hover:bg-slate-200"
                >
                  <ChevronLeft size={24} />
                  <span className="text-sm font-bold">主页</span>
                </button>
                <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 sm:flex">
                  <Gauge size={21} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 sm:text-2xl">生产线实时米数</h2>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    收箔机读数
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {activeLines.map((lineId, index) => {
                  const reading = lineMeterReadings[lineId] || { value: null, speed: null, updatedAt: null };
                  const defaultMeterSpeed =
                    lineAssignments.find((line) => line.id === lineId)?.speed ??
                    getDefaultLineSpeed(lineId);
                  const comparisonTime = new Date();
                  const liveValue = getLiveLineMeterValue(reading, comparisonTime);
                  const plannedValue = getPlannedLiveMeterValue(
                    lineConfigs[lineId],
                    scheduleTime,
                    comparisonTime,
                  );
                  const deviation = liveValue !== null && plannedValue !== null
                    ? liveValue - plannedValue
                    : null;
                  const hasLargeDeviation = deviation !== null && Math.abs(deviation) > 3;
                  const updatedDate = reading.updatedAt ? new Date(reading.updatedAt) : null;
                  const hasValidDate = updatedDate && !Number.isNaN(updatedDate.getTime());
                  return (
                    <section
                      key={lineId}
                      className={cn(
                        "rounded-lg border bg-white p-5 shadow-sm",
                        index === 0
                          ? "border-blue-200"
                          : index === 1
                            ? "border-emerald-200"
                            : "border-orange-200",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className={cn(
                            "rounded-md px-3 py-1.5 text-sm font-black",
                            index === 0
                              ? "bg-blue-100 text-blue-800"
                              : index === 1
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-orange-100 text-orange-800",
                          )}
                        >
                          {lineId}# 生产线
                        </div>
                        <Gauge size={19} className="text-slate-400" />
                      </div>

                      <div className="mt-7 flex min-h-[76px] items-end gap-2">
                        <span className="min-w-0 break-all font-mono text-4xl font-black leading-none text-slate-900 sm:text-5xl">
                          {liveValue === null ? "--" : liveValue.toFixed(2)}
                        </span>
                        <span className="pb-1 text-lg font-black text-slate-400">m</span>
                      </div>
                      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                        <span>
                          {hasValidDate
                            ? `校准于 ${format(updatedDate, "MM-dd HH:mm:ss")}`
                            : "尚未录入"}
                        </span>
                        {reading.speed !== null && (
                          <span className="font-mono text-slate-700">
                            {reading.speed.toFixed(2)} m/min
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          "mt-4 grid grid-cols-2 gap-2 rounded-lg border px-3 py-2.5 text-xs font-black",
                          hasLargeDeviation
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400">规划预估米数</div>
                          <div className="mt-0.5 truncate font-mono text-sm">
                            {plannedValue === null ? "--" : `${plannedValue.toFixed(2)}m`}
                          </div>
                        </div>
                        <div className="min-w-0 border-l border-current/15 pl-3">
                          <div className={cn("text-[10px]", hasLargeDeviation ? "text-red-500" : "text-slate-400")}>
                            实际偏差
                          </div>
                          <div className="mt-0.5 truncate font-mono text-sm">
                            {deviation === null
                              ? "--"
                              : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}m`}
                          </div>
                        </div>
                      </div>

                      <form
                        className="mt-6 border-t border-slate-100 pt-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleSaveLineMeter(lineId);
                        }}
                      >
                        <div className="mb-3 text-sm font-black text-slate-800">
                          现场重新校对
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="min-w-0">
                            <span className="mb-1.5 block text-[11px] font-black text-slate-500">
                              收箔机当前米数
                            </span>
                            <div className="flex min-w-0 items-center rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={lineMeterInputs[lineId] || ""}
                                onChange={(event) => {
                                  setLineMeterInputs((prev) => ({ ...prev, [lineId]: event.target.value }));
                                  setLineMeterMessages((prev) => ({ ...prev, [lineId]: "" }));
                                }}
                                onFocus={(event) => event.currentTarget.select()}
                                className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-base font-black text-slate-900 outline-none"
                                placeholder="0.00"
                              />
                              <span className="pr-2 text-xs font-bold text-slate-400">m</span>
                            </div>
                          </label>
                          <label className="min-w-0">
                            <span className="mb-1.5 block text-[11px] font-black text-slate-500">
                              现场实际车速
                            </span>
                            <div className="flex min-w-0 items-center rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={lineMeterSpeedInputs[lineId] || ""}
                                onChange={(event) => {
                                  setLineMeterSpeedInputs((prev) => ({ ...prev, [lineId]: event.target.value }));
                                  setLineMeterMessages((prev) => ({ ...prev, [lineId]: "" }));
                                }}
                                onFocus={(event) => event.currentTarget.select()}
                                className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-base font-black text-slate-900 outline-none"
                                placeholder={String(defaultMeterSpeed)}
                              />
                              <span className="pr-2 text-[10px] font-bold text-slate-400">m/min</span>
                            </div>
                          </label>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          <button
                            type="submit"
                            className={cn(
                              "rounded-lg px-3 py-3 text-sm font-black text-white active:scale-95",
                              index === 0
                                ? "bg-blue-600 hover:bg-blue-700"
                                : index === 1
                                  ? "bg-emerald-600 hover:bg-emerald-700"
                                  : "bg-orange-600 hover:bg-orange-700",
                            )}
                          >
                            按现场数据重新校对
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustLineMeterSpeed(lineId)}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 active:scale-95"
                          >
                            <Gauge size={15} /> 仅调整车速
                          </button>
                        </div>
                        <div
                          className={cn(
                            "mt-2 min-h-4 text-[11px] font-black",
                            lineMeterMessages[lineId]?.includes("校对完成") ||
                            lineMeterMessages[lineId] === "车速已调整" ||
                            lineMeterMessages[lineId] === "已跟随工作台车速更新"
                              ? "text-emerald-600"
                              : "text-red-500",
                          )}
                        >
                          {lineMeterMessages[lineId] || ""}
                        </div>
                      </form>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        ) : activePage === "joint_tracking" ? (
          <div className="bg-slate-950 text-slate-100 flex-1 overflow-auto p-4 sm:p-6 sm:rounded-3xl shadow-sm border border-slate-800">
            <div id="joint-tracking-page-top" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActivePage("dashboard")}
                  className="lg:hidden p-2 -ml-2 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                >
                  <ChevronLeft size={24} />
                  <span className="font-bold text-sm">主页</span>
                </button>
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-300 border border-orange-500/25 flex items-center justify-center">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black">接头动态追踪</h2>
                  <p className="text-xs sm:text-sm font-bold text-slate-400 mt-1">
                    从前处理槽 U4/U5 开始手动校正接头位置，再预测未来每分钟位置。
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeLines.map((line) => (
                  <button
                    key={line}
                    onClick={() => setSelectedLine(line)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-black border",
                      selectedLine === line
                        ? "bg-blue-600 text-white border-blue-400"
                        : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800",
                    )}
                    type="button"
                  >
                    {line}# 线
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const joints = getJointTrackingForLine(selectedLine);
              const trackingJoint = joints.find((joint) => joint.status === "追踪中");
              const activeJoint = trackingJoint || [...joints].sort((a, b) => {
                const distanceToNow = (joint: typeof a) => {
                  if (currentTime.getTime() < joint.startTime.getTime()) {
                    return joint.startTime.getTime() - currentTime.getTime();
                  }
                  if (currentTime.getTime() > joint.exitTime.getTime()) {
                    return currentTime.getTime() - joint.exitTime.getTime();
                  }
                  return 0;
                };
                return distanceToNow(a) - distanceToNow(b);
              })[0];
              const calibratedPoints = getCalibratedUPointsForLine(selectedLine);
              const measuredCount = calibratedPoints.filter(
                (point) => point.calibrated || point.fromDefault,
              ).length;
              const canLocateCurrentSlot =
                activeJoint?.status === "追踪中" && Boolean(activeJoint.currentSlot?.id);
              const currentJointMarkMap = new Map<string, JointCalibrationMark>(
                (jointCalibrationMarks[selectedLine] || [])
                  .filter((mark) => activeJoint && mark.jointId === activeJoint.id)
                  .map((mark) => [`${mark.slotId}:${mark.uIndex}`, mark] as [string, JointCalibrationMark]),
              );
              const formatJointPointTime = (time: Date, includeSeconds = false) => {
                if (Number.isNaN(time.getTime())) return "--";
                const sameDay = format(time, "yyyy-MM-dd") === format(currentTime, "yyyy-MM-dd");
                if (sameDay) return format(time, includeSeconds ? "HH:mm:ss" : "HH:mm");
                return format(time, includeSeconds ? "MM-dd HH:mm:ss" : "MM-dd HH:mm");
              };
              const getJointPointArrivalInfo = (point?: (typeof calibratedPoints)[number]) => {
                if (!point) return null;
                const mark = currentJointMarkMap.get(point.key);
                if (mark?.markedAt) {
                  const markedAt = new Date(mark.markedAt);
                  if (!Number.isNaN(markedAt.getTime())) {
                    return {
                      label: "到达",
                      value: formatJointPointTime(markedAt, true),
                      tone: "manual" as const,
                    };
                  }
                }
                if (!activeJoint) return null;

                const pointPosition = Math.max(0, Math.min(240, Number(point.position || 0)));
                const currentDistance = Math.max(0, Math.min(240, Number(activeJoint.clampedDistance || 0)));
                const hasNotEntered = currentTime.getTime() < activeJoint.startTime.getTime();
                const isFuturePoint = hasNotEntered || pointPosition >= currentDistance;
                const arrivalTime = hasNotEntered
                  ? addDistanceWithSpeed(
                      activeJoint.startTime,
                      pointPosition,
                      lineConfigs[selectedLine],
                      scheduleTime,
                    )
                  : isFuturePoint
                    ? addDistanceWithSpeed(
                        currentTime,
                        pointPosition - currentDistance,
                        lineConfigs[selectedLine],
                        scheduleTime,
                      )
                    : subtractDistanceWithSpeed(
                        currentTime,
                        currentDistance - pointPosition,
                        lineConfigs[selectedLine],
                        scheduleTime,
                      );

                return {
                  label: isFuturePoint ? "预计" : "估计",
                  value: formatJointPointTime(arrivalTime),
                  tone: isFuturePoint ? ("future" as const) : ("estimated" as const),
                };
              };
              const scrollToCurrentSlot = () => {
                if (!activeJoint?.currentSlot?.id) return;
                document
                  .getElementById(`joint-slot-card-${selectedLine}-${activeJoint.currentSlot.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              };
              const scrollToJointSlot = (slotId?: string) => {
                if (!slotId) return;
                document
                  .getElementById(`joint-slot-card-${selectedLine}-${slotId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              };
              const scrollToJointTrackingTop = () => {
                document
                  .getElementById("joint-tracking-page-top")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              };
              const furnaceQuickLinks = ["炉1", "炉2", "炉3"].map((name) => {
                const point = calibratedPoints.find(
                  (item) => item.slot.name === name && item.uIndex === 1,
                );
                return {
                  name,
                  slotId: point?.slot.id,
                  arrivalInfo: getJointPointArrivalInfo(point),
                };
              });

              return (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-5">
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-sm font-black text-slate-100">当前接头</h3>
                          <p className="text-[11px] font-bold text-slate-500 mt-1">
                            标记到达后，接头会从所选槽/U的真实位置继续跟踪。
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-right">
                          <div className="text-[10px] font-black text-slate-500">标定点</div>
                          <div className="text-xl font-black text-emerald-300">{measuredCount}</div>
                        </div>
                      </div>

                      {!activeJoint ? (
                        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-xs font-bold text-slate-500">
                          当前规划里还没有接头任务。生成分卷计划后，末端接头会出现在这里。
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-black text-slate-500">
                                接头任务 · {activeJoint.lineId}#线
                              </div>
                              <div className="mt-1 text-2xl font-black text-white">
                                {activeJoint.status === "追踪中"
                                  ? `${activeJoint.currentSlot?.name || "未知阶段"}${activeJoint.currentSlot && activeJoint.currentU > 0 ? ` · ${getJointPointLabel(activeJoint.currentSlot, activeJoint.currentU)}` : ""}`
                                  : activeJoint.status}
                              </div>
                              <div className="mt-1 text-[11px] font-bold text-slate-400">
                                进入 {format(activeJoint.startTime, "HH:mm")} · 出线 {format(activeJoint.exitTime, "HH:mm")} · 当前车速 {getSpeedAtTime(lineConfigs[selectedLine], currentTime, scheduleTime).toFixed(2)} m/min
                              </div>
                              {activeJoint.trackingCorrected && activeJoint.correctedAt && (
                                <div className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-300">
                                  <span>已手动校正 {format(activeJoint.correctedAt, "HH:mm:ss")}</span>
                                  <span className="font-mono">
                                    对原预估 {activeJoint.correctionOffset >= 0 ? "+" : ""}{activeJoint.correctionOffset.toFixed(1)}m
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl bg-emerald-500/10 text-emerald-300 px-3 py-2 text-right font-mono">
                              <div className="text-2xl font-black">{activeJoint.clampedDistance.toFixed(1)}m</div>
                              <div className="text-[10px] font-bold">/ 240m</div>
                            </div>
                          </div>
                          <div className="mt-4 h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-emerald-400"
                              style={{ width: `${Math.max(0, Math.min(100, activeJoint.progress))}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={!canLocateCurrentSlot}
                            onClick={scrollToCurrentSlot}
                            className="mt-4 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
                          >
                            <MapPin size={16} />
                            一键到目前槽
                          </button>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {furnaceQuickLinks.map((item) => (
                              <button
                                key={item.name}
                                type="button"
                                disabled={!item.slotId}
                                onClick={() => scrollToJointSlot(item.slotId)}
                                className={cn(
                                  "rounded-xl border px-2 py-2 text-left active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
                                  item.arrivalInfo?.tone === "manual"
                                    ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                                    : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800",
                                )}
                              >
                                <div className="text-xs font-black">{item.name}</div>
                                <div className={cn(
                                  "mt-0.5 truncate text-[10px] font-black",
                                  item.arrivalInfo?.tone === "future"
                                    ? "text-blue-300"
                                    : item.arrivalInfo?.tone === "manual"
                                      ? "text-orange-300"
                                      : "text-slate-500",
                                )}>
                                  {item.arrivalInfo
                                    ? `${item.arrivalInfo.label} ${item.arrivalInfo.value}`
                                    : "--"}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                      <div className="sticky top-0 z-20 -mx-2 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-2 py-3 backdrop-blur">
                        <div>
                          <h3 className="text-sm font-black text-slate-100">槽和 U 到达定位</h3>
                          <p className="text-[11px] font-bold text-slate-500 mt-1">
                            对接槽至前处理 U3 无需打点，从 U4/U5 开始；系统误判状态时仍可校正。
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={scrollToJointTrackingTop}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-black text-slate-300 hover:bg-slate-800 flex items-center gap-1"
                          >
                            <ChevronRight size={12} className="-rotate-90" /> 回顶部
                          </button>
                          <button
                            type="button"
                            disabled={!canLocateCurrentSlot}
                            onClick={scrollToCurrentSlot}
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-1"
                          >
                            <MapPin size={12} /> 目前槽
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {normalizeJointSlots(jointSlotConfigs[selectedLine]).map((slot) => (
                          <div
                            id={`joint-slot-card-${selectedLine}-${slot.id}`}
                            key={slot.id}
                            className={cn(
                              "scroll-mt-24 rounded-xl border bg-slate-950/60 p-3 transition-all",
                              activeJoint?.status === "追踪中" && activeJoint.currentSlot?.id === slot.id
                                ? "border-emerald-400 ring-2 ring-emerald-400/30 bg-emerald-500/5"
                                : "border-slate-800",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="font-black text-sm text-slate-200">{slot.name}</div>
                              <div className="text-[10px] font-bold text-slate-500">
                                {isFurnaceJointSlot(slot)
                                  ? "炉前 / 炉后"
                                  : slot.uCount > 0
                                    ? `${slot.uCount} 个 U`
                                    : "无 U"}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {Array.from({ length: Math.max(1, slot.uCount) }, (_, idx) => {
                                const uIndex = slot.uCount > 0 ? idx + 1 : 0;
                                const point = calibratedPoints.find((item) => item.slot.id === slot.id && item.uIndex === uIndex);
                                const arrivalInfo = getJointPointArrivalInfo(point);
                                const isCurrentU =
                                  activeJoint?.status === "追踪中" &&
                                  activeJoint.currentSlot?.id === slot.id &&
                                  activeJoint.currentU === uIndex;
                                const isTrackingStartPoint = isInitialJointTrackingPoint(slot, uIndex);
                                const canMarkPoint = canMarkJointTrackingPoint(slot, uIndex);
                                return (
                                  <div
                                    key={`${slot.id}-${uIndex}`}
                                    className={cn(
                                      "rounded-lg bg-slate-900 border p-2 transition-all",
                                      isCurrentU
                                        ? "border-orange-400 ring-2 ring-orange-400/25"
                                        : "border-slate-800",
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-1">
                                        <span className="text-xs font-black text-slate-200">
                                          {getJointPointLabel(slot, uIndex)}
                                        </span>
                                        {isTrackingStartPoint && (
                                          <span className="rounded bg-blue-500/15 px-1 py-0.5 text-[8px] font-black text-blue-300">
                                            起始
                                          </span>
                                        )}
                                      </div>
                                      <div className="shrink-0 text-right leading-tight">
                                        {arrivalInfo && (
                                          <div className={cn(
                                            "mb-0.5 text-[9px] font-black",
                                            arrivalInfo.tone === "manual"
                                              ? "text-orange-300"
                                              : arrivalInfo.tone === "future"
                                                ? "text-blue-300"
                                                : "text-slate-500",
                                          )}>
                                            {arrivalInfo.label} {arrivalInfo.value}
                                          </div>
                                        )}
                                        <span className={cn(
                                          "text-[10px] font-mono font-black",
                                          point?.calibrated || point?.fromDefault
                                            ? "text-emerald-300"
                                            : "text-slate-500",
                                        )}>
                                          {point ? point.position.toFixed(1) : "--"}m
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-1">
                                      <button
                                        type="button"
                                        disabled={!activeJoint || !canMarkPoint}
                                        onClick={() => activeJoint && markJointUPosition(selectedLine, activeJoint.id, slot.id, uIndex)}
                                        className="rounded bg-orange-600 disabled:opacity-40 disabled:bg-slate-700 px-2 py-1.5 text-[10px] font-black text-white"
                                      >
                                        {canMarkPoint ? "标记到达" : "无需标记"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!point?.calibrated}
                                        onClick={() => clearJointUPosition(selectedLine, slot.id, uIndex)}
                                        className="rounded bg-slate-800 px-2 py-1.5 text-[10px] font-black text-slate-300 disabled:opacity-45"
                                      >
                                        {point?.calibrated
                                          ? point.hasDefaultPosition
                                            ? "恢复默认"
                                            : "清除"
                                          : point?.fromDefault
                                            ? "默认值"
                                            : "清除"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                      <h3 className="text-sm font-black text-slate-100 mb-3">未来每分钟位置</h3>
                      {!activeJoint ? (
                        <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs font-bold text-slate-500">
                          暂无可预测接头。
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                          {Array.from({ length: 31 }, (_, minute) => {
                            const futureTime = addMinutes(currentTime, minute);
                            const distance =
                              activeJoint.clampedDistance +
                              distanceBetweenWithSpeed(currentTime, futureTime, lineConfigs[selectedLine], scheduleTime);
                            const location = getCalibratedLocationForLine(selectedLine, distance);
                            const isOut = distance > 240;
                            return (
                              <div key={minute} className="grid grid-cols-[56px_minmax(0,1fr)_64px] gap-2 items-center rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2">
                                <div className="font-mono text-xs font-black text-blue-300">
                                  {format(futureTime, "HH:mm")}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-black text-slate-200">
                                    {isOut
                                      ? "已出生产线"
                                      : location
                                        ? `${location.slot.name}${location.uIndex > 0 ? ` · ${getJointPointLabel(location.slot, location.uIndex)}` : ""}`
                                        : "未知阶段"}
                                  </div>
                                  <div className="text-[10px] font-bold text-slate-500">
                                    {minute === 0 ? "当前" : `${minute} 分钟后`}
                                  </div>
                                </div>
                                <div className="text-right font-mono text-xs font-black text-slate-400">
                                  {Math.min(240, distance).toFixed(1)}m
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              );
            })()}
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
            <AdminDashboard
              onSaveFullSnapshot={handleSaveFullSnapshot}
              onLoadSnapshot={(configs, splicing, washes, jointSlots, restoredPunchRecords, restoredJointCalibrationMarks) => {
                const restored = reviveLineStatePayload({
                  lineConfigs: configs,
                  activeSplicing: splicing,
                  lastWashes: washes,
                  jointSlotConfigs: jointSlots,
                  jointCalibrationMarks: restoredJointCalibrationMarks,
                  punchRecords: restoredPunchRecords,
                }, lineAssignments);
                setLineConfigs(restored.lineConfigs);
                setActiveSplicing(restored.activeSplicing);
                setLastWashes(restored.lastWashes);
                setJointSlotConfigs(restored.jointSlotConfigs);
                setJointCalibrationMarks(restored.jointCalibrationMarks);
                setPunchRecords(restored.punchRecords);
                setIsPlanningMode(true);
                setActivePage("plan");
              }}
            />
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
                <div className="flex flex-col">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
                    分卷计划图表与编辑
                  </h2>
                  <div className="text-sm font-bold text-slate-500 mt-0.5">
                    {(() => {
                      const planShiftStart = getCurrentShiftStart(scheduleTime);
                      const planShiftInfo = getShiftInfo(planShiftStart, rosterSettings);
                      return (
                        <>
                          {format(planShiftStart, "yyyy年MM月dd日")}
                          <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-black text-blue-600">
                            {getShiftOwnershipLabel(planShiftStart, rosterSettings)}
                          </span>
                          <span className="ml-1">
                            · {planShiftInfo.name} ({planShiftInfo.timeStr})
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
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
                currentTime={scheduleTime}
                nowTime={currentTime}
                rosterSettings={rosterSettings}
                lines={activeLines}
                activeSplicing={activeSplicing}
                onStartRackCountdown={handleStartRackCountdown}
                onAcknowledgeRackAlarm={handleAcknowledgeRackAlarm}
                onConfirmJointPrepComplete={handleConfirmJointPrepComplete}
              />
            </div>
          </div>
        ) : activePage === "daily_record" ? (
          <DailyRecordPage
            setActivePage={setActivePage}
            lines={activeLines}
            defaultSpeeds={Object.fromEntries(
              activeLines.map((line) => [line, lineConfigs[line]?.speed || 0]),
            )}
            storageKey={getDailyRecordStorageKey(appUser.username, dateKey)}
          />
        ) : activePage === "settings" ? (
          <SettingsPage 
            updatedSplicingTasks={updatedSplicingTasks}
            lastWashes={lastWashes}
            currentTime={currentTime}
            LINES={activeLines}
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
            rosterSettings={rosterSettings}
            setRosterSettings={handleRosterSettingsChange}
            shiftCycleLabels={SHIFT_CYCLE_LABELS}
          />
        ) : null}
      </main>

      {/* Backup Export Dialog */}
      {backupExportDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xl max-w-2xl w-full mx-auto max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">完整备份已生成</h3>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  优先点“选择位置保存”。iPhone 会通过系统分享选择“存储到文件”；如果浏览器仍然限制保存，请复制文本到备忘录或微信文件助手。
                </p>
              </div>
              <button
                onClick={() => {
                  setBackupExportDialog(null);
                  setBackupCopyStatus("idle");
                }}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 break-all">
              {backupExportDialog.fileName}
            </div>
            <textarea
              ref={backupExportTextRef}
              readOnly
              value={backupExportDialog.content}
              className="min-h-[220px] flex-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              onFocus={(event) => event.currentTarget.select()}
            />
            {backupCopyStatus !== "idle" && (
              <div
                className={cn(
                  "mt-3 rounded-xl border px-3 py-2 text-xs font-black",
                  backupCopyStatus === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700",
                )}
              >
                {backupCopyStatus === "success"
                  ? "已复制成功，可以粘贴到备忘录、微信文件助手或文件里保存。"
                  : "浏览器没有允许自动复制，已帮你选中文本，请用系统菜单手动复制。"}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                onClick={handleSaveBackupToDevice}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                type="button"
              >
                <Download size={14} /> 选择位置保存
              </button>
              <button
                onClick={handleCopyBackupText}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-white",
                  backupCopyStatus === "success"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : backupCopyStatus === "manual"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-blue-600 hover:bg-blue-700",
                )}
                type="button"
              >
                {backupCopyStatus === "success" ? (
                  <>
                    <CheckSquare size={14} /> 已复制
                  </>
                ) : backupCopyStatus === "manual" ? (
                  <>
                    <Copy size={14} /> 手动复制
                  </>
                ) : (
                  <>
                    <Copy size={14} /> 复制文本
                  </>
                )}
              </button>
              <button
                onClick={handleShareBackup}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-black text-white hover:bg-teal-700"
                type="button"
              >
                <Share2 size={14} /> 系统分享
              </button>
              <button
                onClick={() => triggerBackupDownload(backupExportDialog.fileName, backupExportDialog.content)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                type="button"
              >
                <Download size={14} /> 普通下载
              </button>
              <button
                onClick={() => {
                  setBackupExportDialog(null);
                  setBackupCopyStatus("idle");
                }}
                className="flex items-center justify-center rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                type="button"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Text Import Dialog */}
      {showBackupTextImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xl max-w-2xl w-full mx-auto max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">粘贴备份文本恢复</h3>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  把之前保存的完整 JSON 文本粘贴到这里，确认后会恢复规划并刷新页面。
                </p>
              </div>
              <button
                onClick={() => setShowBackupTextImport(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              value={backupImportText}
              onChange={(event) => setBackupImportText(event.target.value)}
              className="min-h-[260px] flex-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder='请粘贴以 {"app":"maizhanpiao-foil-planner"... 开头的备份 JSON'
            />
            <div className="mt-4 flex flex-col sm:flex-row justify-end gap-2">
              <button
                onClick={() => setShowBackupTextImport(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                type="button"
              >
                取消
              </button>
              <button
                onClick={handleImportBackupText}
                disabled={!backupImportText.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
                type="button"
              >
                导入并恢复
              </button>
            </div>
          </div>
        </div>
      )}

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
