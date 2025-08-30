"use client";

import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { LucideLogIn, LogOut, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ForgotPassword from "@/components/ForgotPassword";
import ChangePassword from "@/components/ChangePassword";
import ForgotEmail from "@/components/ForgotEmail";
import PasswordInput from "@/components/PasswordInput";
import FontSwitcher from "@/components/FontSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import { ThemeKey } from "@/lib/themes";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import ImageLogoControls from "@/components/ImageLogoControls";

const META_REF = doc(db, "siteSettingsEditable", SITE_KEY);

type MediaType = "video" | "image";

type MetaDoc = {
  url?: string;
  type?: MediaType;
  themeGradient?: ThemeKey;
  imageUrls?: string[];
};

export default function LoginPage() {
  // 共通state
  const [theme, setTheme] = useState<ThemeKey>("brandA");
  const [user, setUser] = useState<User | null>(null);

  // 未ログインUI用
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // モーダル類（排他表示）
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotEmail, setShowForgotEmail] = useState(false);

  // 初期テーマ読み込み
  useEffect(() => {
    (async () => {
      const snap = await getDoc(META_REF);
      if (!snap.exists()) return;
      const data = snap.data() as MetaDoc;
      if (data.themeGradient) setTheme(data.themeGradient);
    })().catch((err) => console.error("背景データ取得失敗:", err));
  }, []);

  // 認証状態 + ownerId権限チェック
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "siteSettings", SITE_KEY));
        if (!snap.exists()) {
          setError("サイト情報が見つかりません。");
          await signOut(auth);
          return;
        }
        const data = snap.data();
        if (data.ownerId !== firebaseUser.uid) {
          setError("このアカウントには管理権限がありません。");
          await signOut(auth);
          return;
        }
        setUser(firebaseUser);
      } catch (e) {
        console.error(e);
        setError("権限確認中にエラーが発生しました。");
        await signOut(auth);
      }
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged 内で ownerId チェックが走る
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case "auth/invalid-email":
            setError("メールアドレスの形式が正しくありません。");
            break;
          case "auth/user-not-found":
            setError("このメールアドレスは登録されていません。");
            break;
          case "auth/wrong-password":
            setError("パスワードが間違っています。");
            break;
          case "auth/invalid-credential":
            setError("認証情報が正しくありません。");
            break;
          default:
            setError("ログインに失敗しました。");
        }
      } else {
        setError("不明なエラーが発生しました。");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleThemeChange = async (newTheme: ThemeKey) => {
    setTheme(newTheme);
    await setDoc(META_REF, { themeGradient: newTheme }, { merge: true });
  };

  // ====== レンダリング =====================================================

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {/* ログイン後ビュー */}
      {user ? (
        <>
          {showChangePassword ? (
            // パスワード変更は単独ビュー（重なり防止）
            <div className="w-full max-w-md">
              <ChangePassword onClose={() => setShowChangePassword(false)} />
            </div>
          ) : (
            <div className="w-full max-w-lg space-y-6">
              {/* 設定カード（ThemeSelector/FontSwitcher） */}
              <Card className="shadow-xl bg-transparent">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    表示設定
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ImageLogoControls
                    siteKey={SITE_KEY} // ← ここだけ指定
                    onProgress={(p) => console.log(p)}
                    onDone={(type, url) => console.log("done:", type, url)}
                  />
                  <div>
                    <p className="text-sm mb-2">テーマカラー</p>
                    <ThemeSelector
                      currentTheme={theme}
                      onChange={handleThemeChange}
                    />
                  </div>
                  <div>
                    <p className="text-sm mb-2">フォント</p>
                    <FontSwitcher />
                  </div>
                </CardContent>
              </Card>

              {/* アカウント操作カード */}
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <LogOut size={20} /> ログアウト
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                  <p>{user.email} としてログイン中です。</p>
                  <button
                    onClick={() => setShowChangePassword(true)}
                    className="text-blue-500 hover:underline"
                  >
                    パスワードを変更
                  </button>
                  <Button onClick={handleLogout} className="w-full bg-blue-500">
                    ログアウト
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : (
        // 未ログインビュー
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <LucideLogIn size={20} /> 管理者ログイン
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>ログインエラー</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => {
                    setShowForgotEmail(false);
                    setShowForgotPassword(true);
                  }}
                  className="text-blue-500 hover:underline"
                >
                  パスワードを忘れた方
                </button>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setShowForgotEmail(true);
                  }}
                  className="text-blue-500 hover:underline"
                >
                  メールアドレスを忘れた方
                </button>
              </div>

              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-blue-500"
              >
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </CardContent>
          </Card>

          {/* モーダル類：同時に1つだけ開く */}
          {showForgotPassword && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <ForgotPassword onClose={() => setShowForgotPassword(false)} />
              </div>
            </div>
          )}

          {showForgotEmail && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <ForgotEmail
                  onClose={() => setShowForgotEmail(false)}
                  onEmailFound={(found) => {
                    setEmail(found); // 自動入力
                    setShowForgotEmail(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
