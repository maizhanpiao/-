import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, orderBy, where, getDocs } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { handleFirestoreError, OperationType } from "./firestoreErrorHandler";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJson, setSelectedJson] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const path = `users/${user.uid}/lineStates`;
      try {
        const q = query(
          collection(db, "users", user.uid, "lineStates"),
          where("userId", "==", user.uid),
          orderBy("dateKey", "desc")
        );
        const querySnapshot = await getDocs(q);
        const rows: any[] = [];
        querySnapshot.forEach((doc) => {
          rows.push({ id: doc.id, ...doc.data() });
        });
        setData(rows);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500">
        请先登录以查看管理后台数据。后台数据按天记录您的排产历史。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">
          历史生产数据总览
        </h2>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500">加载中...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
          暂无历史数据。使用系统后，将会每天自动保存一条当天的生产状态。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">生产日期 (Date Key)</th>
                  <th className="px-6 py-3 font-semibold">最后更新时间</th>
                  <th className="px-6 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {row.dateKey}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                      {row.updatedAt && row.updatedAt.toDate
                        ? format(row.updatedAt.toDate(), "yyyy-MM-dd HH:mm:ss")
                        : "不明"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                           setSelectedJson(JSON.stringify(JSON.parse(row.lineConfigs), null, 2));
                        }}
                        className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition-colors"
                      >
                        查看详细排产 JSON
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
