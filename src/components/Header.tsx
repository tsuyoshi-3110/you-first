"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Image from "next/image";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { useHeaderLogoUrl } from "../hooks/useHeaderLogoUrl";
import { auth } from "@/lib/firebase";
import { THEMES, ThemeKey } from "@/lib/themes"; // 🔧 追加

const HEADER_H = "3rem";

export default function Header({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const gradient = useThemeGradient();
  const logoUrl = useHeaderLogoUrl();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsLoggedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  const gradientClass = gradient
    ? `bg-gradient-to-b ${gradient}`
    : "bg-gray-100";

  // ダーク判定（brandH, brandG, brandI）
  const darkKeys: ThemeKey[] = ["brandH", "brandG", "brandI"];
  const currentKey = (Object.entries(THEMES).find(
    ([, v]) => v === gradient
  )?.[0] ?? null) as ThemeKey | null;
  const isDark = currentKey ? darkKeys.includes(currentKey) : false;

  return (
    <header
      className={clsx(
        "sticky top-0 z-30 flex items-center justify-between px-4 h-12",
        gradientClass,
        className,
        !isDark && "border-b border-gray-300" // 明るい場合は下線
      )}
      style={{ "--header-h": HEADER_H } as React.CSSProperties}
    >
      {/* ロゴ */}
      <Link
        href="/"
        className={clsx(
          "text-md font-bold flex items-center gap-2 py-2 hover:opacity-50",
          isDark ? "text-white" : "text-black"
        )}
      >
        {logoUrl && logoUrl.trim() !== "" && (
          <Image
            src={logoUrl}
            alt="ロゴ"
            width={48}
            height={48}
            className="w-12 h-12 object-contain transition-opacity duration-200"
            unoptimized
          />
        )}
        You-First
      </Link>

      {/* SNS アイコン */}
      <nav className="flex gap-2 ml-auto mr-2">
        <a
          href="https://www.instagram.com/yuu_cleaning?igsh=MTRpM2VkZzQwbDRpZQ=="
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            isDark ? "text-white" : "text-black",
            "hover:text-pink-600 transition"
          )}
        >
          <Image
            src="/instagram-logo.png"
            alt="Instagram"
            width={32}
            height={32}
            className="object-contain"
            unoptimized
          />
        </a>
      </nav>

      {/* ハンバーガーメニュー */}
      <div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={clsx(
                "w-7 h-7 border-2",
                isDark ? "text-white border-white" : "text-black border-black"
              )}
            >
              <Menu size={26} />
            </Button>
          </SheetTrigger>

          <SheetContent
            side="right"
            className={clsx(
              "flex flex-col",
              "bg-gray-100",
              gradient && "bg-gradient-to-b",
              gradient
            )}
          >
            <SheetHeader className="pt-4 px-4">
              <SheetTitle
                className={clsx(
                  "text-center text-xl",
                  isDark ? "text-white" : "text-black"
                )}
              >
                メニュー
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 flex flex-col justify-center items-center space-y-4 text-center">
              {[
                { href: "/products", label: "施工実績" },
                { href: "/staffs", label: "スタッフ" },
                { href: "/menu", label: "料金" },
                { href: "/stores", label: "対応エリア" },
                { href: "/about", label: "当店の思い" },
                { href: "/blog", label: "ブログ" },
                // { href: "/news", label: "お知らせ" },
                // { href: "mailto:tsreform.yukisaito@gmail.com", label: "ご連絡はこちら" },
                { href: "/apply", label: "ご予約はこちら" },
                { href: "/jobApp", label: "協力業者募集！" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "text-lg",
                    isDark ? "text-white" : "text-black"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {isLoggedIn && (
                <>
                  <Link
                    href="/postList"
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "block text-center text-lg",
                      isDark ? "text-white" : "text-black"
                    )}
                  >
                    タイムライン
                  </Link>
                  <Link
                    href="/community"
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "block text-center text-lg",
                      isDark ? "text-white" : "text-black"
                    )}
                  >
                    コミュニティ
                  </Link>
                  <Link
                    href="/analytics"
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "block text-center text-lg",
                      isDark ? "text-white" : "text-black"
                    )}
                  >
                    分析
                  </Link>
                </>
              )}

              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className={clsx(
                  "block text-center text-lg",
                  isDark ? "text-white" : "text-black"
                )}
              >
                Administrator Login
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
