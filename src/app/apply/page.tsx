// app/job/apply/page.tsx
"use client";

import JobApplyForm from "@/components/job/JobApplyForm";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";
import clsx from "clsx";

const DARK_KEYS: ThemeKey[] = ["brandH", "brandG", "brandI"];

export default function JobApplyPage() {
  const gradient = useThemeGradient();
  const isDark =
    gradient &&
    DARK_KEYS.includes(
      Object.keys(THEMES).find(
        (k) => THEMES[k as ThemeKey] === gradient
      ) as ThemeKey
    );
  const textClass = isDark ? "text-white" : "text-black";

  return (
    <div className={clsx("max-w-3xl mx-auto p-4 space-y-6", textClass)}>
      <h1 className="text-xl font-bold ">求人応募フォーム</h1>
      <p className="text-sm opacity-80 ">
        必要事項をご入力のうえ送信してください。後日、担当者よりご連絡差し上げます。
      </p>
      <JobApplyForm />
    </div>
  );
}
