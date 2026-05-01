import * as fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update activePage state definition
content = content.replace(
  /const \[activePage, setActivePage\] = useState<"dashboard" \| "plan">\(\s*"dashboard",\s*\);/,
  'const [activePage, setActivePage] = useState<"dashboard" | "plan" | "admin">("dashboard");'
);

// 2. Add admin button to mobile and desktop navs
const desktopNavBtn = `<button
              onClick={() => { setActivePage("plan"); setIsMobileMenuOpen(false); }}
              className={cn(`;
content = content.replace(desktopNavBtn, `<button
              onClick={() => { setActivePage("admin"); setIsMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
                activePage === "admin"
                  ? "bg-blue-600/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20"
                  : "hover:bg-slate-800 text-slate-300 hover:text-white",
              )}
            >
              <Database size={16} /> 数据后台
            </button>\n            <button
              onClick={() => { setActivePage("plan"); setIsMobileMenuOpen(false); }}
              className={cn(`);

// Need to import Database icon, and Admin component.
content = content.replace('X,\n  Settings2,', 'X,\n  Settings2,\n  Database,');

// Import AdminDashboard component
content = content.replace('import React, { useState, useEffect, useRef } from "react";', 'import React, { useState, useEffect, useRef } from "react";\nimport AdminDashboard from "./AdminDashboard";');

// Render AdminDashboard
const adminRender = `) : activePage === "admin" ? (
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
        ) : activePage === "plan" ? (`;
content = content.replace(') : activePage === "plan" ? (', adminRender);

// Replace Simulator button content to be more explicit about testing
content = content.replace(
  '<span className="hidden sm:inline">系统时间:</span>',
  '<span className="hidden sm:inline bg-amber-500 text-white rounded px-1 text-[10px] mr-1">测试</span><span className="hidden sm:inline">系统时间:</span>'
)

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched App.tsx with admin");
