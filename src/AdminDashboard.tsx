import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, orderBy, where, getDocs } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { handleFirestoreError, OperationType } from "./firestoreErrorHandler";
import { format } from "date-fns";

export default function AdminDashboard({ onLoadSnapshot }: { onLoadSnapshot?: (configs: any, splicing: any, washes: any) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJson, setSelectedJson] = useState<string | null>(null);

  const [isAdminAuth, setIsAdminAuth] = useState(localStorage.getItem("adminAuth") === "true");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "123456") {
      setIsAdminAuth(true);
      localStorage.setItem("adminAuth", "true");
      setLoginError("");
    } else {
      setLoginError("账号或密码错误");
    }
  };

  const handleLogout = () => {
    setIsAdminAuth(false);
    localStorage.removeItem("adminAuth");
  };

  useEffect(() => {
    if (!user || !isAdminAuth) return;
    const fetchData = async () => {
      setLoading(true);
      const path = `users/${user.uid}/planSnapshots`;
      try {
        const q = query(
          collection(db, "users", user.uid, "planSnapshots"),
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const rows: any[] = [];
        querySnapshot.forEach((doc) => {
          rows.push({ id: doc.id, ...doc.data() });
          console.table({ id: doc.id, ...doc.data() });
        });
        setData(rows);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, isAdminAuth]);

  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500">
        请先通过平台登录您的 Google 账号以使用保存和管理功能。
      </div>
    );
  }

  if (!isAdminAuth) {
    return (
      <div className="flex items-center justify-center py-20">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 flex flex-col gap-4">
          <h2 className="text-2xl font-black text-slate-800 text-center mb-2">数据后台登录</h2>
          
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">账号</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="请输入密码"
            />
          </div>
          
          {loginError && <p className="text-red-500 text-xs font-bold">{loginError}</p>}
          
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow mt-2">
            登录
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">
          历史保存的排产记录
        </h2>
        <button onClick={handleLogout} className="text-sm font-bold text-slate-500 hover:text-red-500">
          退出后台
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500">加载中...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
          暂无历史保存数据。当您在“分卷计划”页面点击“保存方案”时，系统将保存一份记录于此。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">保存时间</th>
                  <th className="px-6 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-800 font-mono text-sm font-bold">
                      {(() => {
                        try {
                          if (row.timestamp) {
                            if (typeof row.timestamp.toDate === 'function') {
                              return format(row.timestamp.toDate(), "yyyy-MM-dd HH:mm:ss");
                            } else if (row.timestamp.seconds) {
                              return format(new Date(row.timestamp.seconds * 1000), "yyyy-MM-dd HH:mm:ss");
                            }
                          }
                          // Fallback to createdAt or updatedAt if exist
                          if (row.updatedAt) {
                             if (typeof row.updatedAt.toDate === 'function') {
                               return format(row.updatedAt.toDate(), "yyyy-MM-dd HH:mm:ss");
                             } else if (row.updatedAt.seconds) {
                               return format(new Date(row.updatedAt.seconds * 1000), "yyyy-MM-dd HH:mm:ss");
                             }
                          }
                          return "不明";
                        } catch(e) {
                          return "不明";
                        }
                      })()}
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button
                        onClick={() => {
                          if (onLoadSnapshot) {
                            try {
                              const configs = JSON.parse(row.lineConfigs);
                              const splicing = (row.activeSplicing && row.activeSplicing !== 'undefined') ? JSON.parse(row.activeSplicing) : {};
                              const washes = (row.lastWashes && row.lastWashes !== 'undefined') ? JSON.parse(row.lastWashes) : {};
                              onLoadSnapshot(configs, splicing, washes);
                            } catch (error) {
                              console.error('Failed to parse snapshot:', error);
                              alert('解析该历史记录失败，请检查数据完整性或尝试其他的记录。');
                            }
                          }
                        }}
                        className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition-colors"
                      >
                        载入此数据到模拟页面
                      </button>
                      <button
                        onClick={() => {
                           setSelectedJson(JSON.stringify(JSON.parse(row.lineConfigs), null, 2));
                        }}
                        className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                      >
                        查看明细 JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedJson && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">排产数据明细</h3>
              <button 
                onClick={() => setSelectedJson(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 bg-slate-50">
              <pre className="text-[11px] font-mono text-slate-700">
                {selectedJson}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
