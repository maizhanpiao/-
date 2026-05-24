import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function getAuthErrorMessage(error: any) {
  const code = error?.code || "auth/unknown";
  const host = window.location.hostname || window.location.host;
  if (code === "auth/unauthorized-domain") {
    return `当前域名 ${host} 没有加入 Firebase Authentication 的 Authorized domains。请到 Firebase 控制台 -> Authentication -> Settings -> Authorized domains 添加 ${host} 后重试。`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase Authentication 还没有启用 Google 登录。请到 Firebase 控制台 -> Authentication -> Sign-in method 启用 Google。";
  }
  if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
    return "登录弹窗被浏览器拦截。系统会尝试改用跳转登录；如果仍失败，请在浏览器允许此站点弹窗后重试。";
  }
  if (code === "auth/popup-closed-by-user") {
    return "您关闭了 Google 登录窗口，尚未完成登录。";
  }
  if (code === "auth/network-request-failed") {
    return "网络连接失败，无法连接 Google/Firebase 登录服务。请检查网络后重试。";
  }
  return `Google 登录失败：${code}${error?.message ? `\n${error.message}` : ""}`;
}

function shouldTryRedirect(error: any) {
  return [
    "auth/popup-blocked",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(error?.code);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error("Google redirect sign-in failed", error);
      alert(getAuthErrorMessage(error));
    });
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google popup sign-in failed", error);
      if (shouldTryRedirect(error)) {
        alert(getAuthErrorMessage(error));
        await signInWithRedirect(auth, provider);
        return;
      }
      alert(getAuthErrorMessage(error));
    }
  };

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
