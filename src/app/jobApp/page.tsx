"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

export default function JobPage() {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");



  const handleSubmit = async () => {
    if (!name || !kana || !email || !message || !SITE_KEY) return;
    setStatus("loading");

    const res = await fetch("/api/send-job-application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kana, email, message, SITE_KEY }),
    });

    if (res.ok) {
      setStatus("sent");
      setName("");
      setKana("");
      setEmail("");
      setMessage("");
    } else {
      setStatus("idle");
      alert("送信に失敗しました。再度お試しください。");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b py-12 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
        <h1 className="text-3xl font-bold mb-4 text-center text-sky-700">
          求人応募フォーム
        </h1>
        <p className="mb-6 text-gray-600 text-center">
          以下の内容をご入力のうえ、「送信」ボタンを押してください。
        </p>
        <div className="space-y-4">
          <Input
            placeholder="お名前（例：大阪　太郎）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-gray-50"
          />
          <Input
            placeholder="ふりがな（例：おおさか たろう）"
            value={kana}
            onChange={(e) => setKana(e.target.value)}
            className="bg-gray-50"
          />
          <Input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-gray-50"
          />
          <Textarea
            placeholder="志望動機・自己PRなど"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-gray-50 min-h-[150px]"
          />
          <Button
            onClick={handleSubmit}
            disabled={status === "loading"}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white"
          >
            {status === "loading"
              ? "送信中..."
              : status === "sent"
              ? "送信完了 🎉"
              : "送信"}
          </Button>
        </div>
        {status === "sent" && (
          <p className="text-green-600 mt-4 text-center">
            応募が完了しました。ご応募ありがとうございます。
          </p>
        )}
      </div>
    </div>
  );
}
