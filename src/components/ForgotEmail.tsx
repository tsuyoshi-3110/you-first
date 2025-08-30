"use client";
import { useState } from "react";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AsYouType } from "libphonenumber-js";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

type Props = {
  onClose: () => void;
  onEmailFound?: (email: string) => void;
};

export default function ForgotEmail({ onClose, onEmailFound }: Props) {
  const [phone, setPhone] = useState("");
  const [rawPhone, setRawPhone] = useState(""); // 数字のみ保持
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const handleSearch = async () => {
    setLoading(true);
    setEmail("");
    setError("");

    try {
      const ref = doc(db, "siteSettings", SITE_KEY);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setError("設定が見つかりません。");
        return;
      }

      const data = snap.data();
      const normalizedPhone = rawPhone.replace(/-/g, ""); // ハイフン除去

      if (data.ownerPhone && data.ownerPhone.replace(/-/g, "") === normalizedPhone) {
        const foundEmail = data.ownerEmail ?? "（メールアドレスが未登録です）";
        setEmail(foundEmail);

        if (onEmailFound && data.ownerEmail) {
          onEmailFound(data.ownerEmail);
        }
      } else {
        setError("一致する電話番号が見つかりません。");
      }
    } catch (e) {
      console.error(e);
      setError("エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, ""); // 数字のみ抽出
    const formatter = new AsYouType("JP");
    const formatted = formatter.input(input);
    setRawPhone(input);
    setPhone(formatted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-lg p-6 shadow-lg space-y-4">
        <h2 className="text-xl font-bold text-center">
          メールアドレスを忘れた場合
        </h2>
        <p className="text-sm text-gray-600 text-center">
          登録済みの電話番号を入力してください。
        </p>

        <Input
          type="tel"
          placeholder="例: 090-1234-5678"
          value={phone}
          onChange={handlePhoneChange}
        />

        <Button
          onClick={handleSearch}
          className="w-full bg-blue-600 text-white"
          disabled={loading}
        >
          {loading ? "照合中…" : "メールアドレスを表示"}
        </Button>

        {email && (
          <p className="text-green-600 text-center text-sm">
            登録メールアドレス：
            <br />
            <strong>{email}</strong>
          </p>
        )}
        {error && <p className="text-red-600 text-center text-sm">{error}</p>}

        <Button variant="outline" onClick={onClose} className="w-full">
          閉じる
        </Button>
      </div>
    </div>
  );
}
