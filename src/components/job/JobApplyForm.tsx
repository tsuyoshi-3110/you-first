// components/job/JobApplyForm.tsx
"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";
import { MessageSquareMore } from "lucide-react";

/* ===============================
   設定
================================ */

const DARK_KEYS: ThemeKey[] = ["brandH", "brandG", "brandI"];

// 予約可能時間帯（30分刻み）
const genTimes = (start = "09:00", end = "18:00") => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const arr: string[] = [];
  let h = sh,
    m = sm;
  while (h < eh || (h === eh && m <= em)) {
    arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) {
      h += 1;
      m = 0;
    }
  }
  return arr;
};
const TIME_SLOTS = genTimes("09:00", "18:00");

// 連絡方法（API 用に保持。UIは出さず既定値 "phone"）
const CONTACT_METHODS = [
  { key: "phone", label: "電話" },
  { key: "email", label: "メール" },
  { key: "line", label: "LINE" },
] as const;

/* ===============================
   バリデーション
   ※ 全項目必須（contactMethod は既定値で内部必須）
================================ */

const schema = z.object({
  name: z.string().min(1, "お名前を入力してください"),
  phone: z
    .string()
    .min(8, "電話番号を入力してください")
    .regex(/^[0-9+\-() ]+$/, "半角数字・記号で入力してください"),
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式が不正です"),
  contactMethod: z.enum(["phone", "email", "line"]), // 既定値あり
  date: z
    .string()
    .min(1, "ご希望日を選択してください")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日付形式が不正です"),
  time: z.string().min(1, "ご希望時間を選択してください"),
  address: z.string().min(1, "ご住所を入力してください"),
  notes: z.string().min(1, "ご要望・相談内容を入力してください").max(1000, "ご要望が長すぎます"),
});
type FormValues = z.infer<typeof schema>;

/* ===============================
   ユーティリティ
================================ */

function todayISO(): string {
  const tz = "Asia/Tokyo";
  const d = new Date();
  const y = d.toLocaleString("ja-JP", { timeZone: tz, year: "numeric" });
  const m = d.toLocaleString("ja-JP", { timeZone: tz, month: "2-digit" });
  const day = d.toLocaleString("ja-JP", { timeZone: tz, day: "2-digit" });
  return `${y}-${m}-${day}`;
}

/* ===============================
   コンポーネント
================================ */

export default function JobApplyForm() {
  const gradient = useThemeGradient();
  const isDark =
    gradient &&
    DARK_KEYS.includes(
      Object.keys(THEMES).find((k) => THEMES[k as ThemeKey] === gradient) as ThemeKey
    );
  const textClass = isDark ? "text-white" : "text-black";

  const defaultDate = useMemo(() => todayISO(), []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      contactMethod: "phone", // UI 非表示の内部必須
      date: defaultDate,
      time: "",
      address: "",
      notes: "",
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const [doneModal, setDoneModal] = useState<null | { name: string }>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (v: FormValues) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/job/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★ siteKey は送らない（API 側で解決する設計に合わせる）
        body: JSON.stringify({
          name: v.name,
          email: v.email,
          phone: v.phone,
          message: [
            `【ご依頼フォーム】`,
            `■ 連絡方法: ${
              CONTACT_METHODS.find((c) => c.key === v.contactMethod)?.label ?? v.contactMethod
            }`,
            `■ 希望日時: ${v.date} ${v.time}`,
            `■ ご住所: ${v.address}`,
            "",
            "■ ご要望・相談内容:",
            v.notes,
          ].join("\n"),
          // 将来拡張に備え補助的に個別も同梱（バックエンドで使うなら）
          contactMethod: v.contactMethod,
          date: v.date,
          time: v.time,
          address: v.address,
          notes: v.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? "送信に失敗しました。");
        return;
      }
      reset({
        ...watch(),
        name: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
        time: "",
        date: defaultDate,
      });
      setDoneModal({ name: v.name });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = todayISO();

  return (
    <div className={clsx("space-y-6", textClass)}>
      <div className="rounded-2xl border shadow-sm backdrop-blur bg-white/80">
        <div className="px-5 pt-5 pb-3 border-b bg-white/60 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <MessageSquareMore className="h-5 w-5 text-black" />
            <h2 className="text-base font-semibold text-black">ご依頼内容</h2>
          </div>
          <p className="mt-1 text-xs text-black/70">
            全ての項目をご入力ください。担当者より折り返しご連絡いたします。
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-6">
          {/* お名前 */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-black">お名前</label>
            <Input
              placeholder="山田 太郎"
              {...register("name")}
              className="text-black"
              required
              aria-required
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {/* 電話番号 */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-black">電話番号</label>
            <Input
              placeholder="09012345678"
              {...register("phone")}
              className="text-black"
              required
              aria-required
              inputMode="tel"
            />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone.message}</p>}
          </div>

          {/* メールアドレス */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-black">メールアドレス</label>
            <Input
              type="email"
              placeholder="example@example.com"
              {...register("email")}
              className="text-black"
              required
              aria-required
              inputMode="email"
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>

          {/* 希望日・希望時間 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-black">ご希望日</label>
              <Input
                type="date"
                min={minDate}
                {...register("date")}
                className="text-black"
                required
                aria-required
              />
              {errors.date && <p className="text-xs text-red-600">{errors.date.message}</p>}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-black">ご希望時間</label>
              <select
                {...register("time")}
                className="h-10 w-full rounded-md border bg-white px-3 text-black"
                required
                aria-required
              >
                <option value="">選択してください</option>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.time && <p className="text-xs text-red-600">{errors.time.message}</p>}
            </div>
          </div>

          {/* ご住所 */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-black">ご住所</label>
            <Input
              placeholder="例）大阪府豊中市小曽根3-6-13"
              {...register("address")}
              className="text-black"
              required
              aria-required
            />
            {errors.address && <p className="text-xs text-red-600">{errors.address.message}</p>}
          </div>

          {/* ご要望（必須化） */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-black">ご要望・相談内容</label>
            <Textarea
              rows={6}
              placeholder="サービス内容をご記入ください"
              {...register("notes")}
              className="text-black"
              required
              aria-required
            />
            {errors.notes && <p className="text-xs text-red-600">{errors.notes.message}</p>}
          </div>

          {/* 送信エラー */}
          {errorMsg && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{errorMsg}</div>
          )}

          {/* 送信ボタン */}
          <div className="pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "送信中…" : "この内容で依頼する"}
            </Button>
          </div>
        </form>
      </div>

      {/* 成功モーダル（白背景・黒文字固定） */}
      {doneModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">
          <div className="w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl text-black">
            <div className="text-base font-semibold mb-2">送信が完了しました</div>
            <p className="text-sm mb-4">
              {doneModal.name} 様、ありがとうございます。
              <br />
              担当者より折り返しご連絡いたします。
            </p>
            <div className="text-right">
              <Button onClick={() => setDoneModal(null)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
