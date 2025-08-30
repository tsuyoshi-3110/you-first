// components/blog/BlogCard.tsx
"use client";

import { BlogPost, BlogBlock, BlogMedia } from "@/types/blog";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil, Trash } from "lucide-react";
import ProductMedia from "@/components/ProductMedia";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";

type Props = {
  post: BlogPost;
  onDelete?: (post: BlogPost) => Promise<void> | void;
  deleting?: boolean;
  className?: string;
};

const DARK_KEYS: ThemeKey[] = ["brandG", "brandH", "brandI"];

/** 後方互換：blocks が無ければ body/media を blocks に変換 */
function toRenderableBlocks(post: BlogPost): BlogBlock[] {
  if (Array.isArray(post.blocks) && post.blocks.length > 0) {
    return post.blocks as BlogBlock[];
  }
  const result: BlogBlock[] = [];
  const body = (post.body ?? "").toString().trim();
  if (body) {
    result.push({ id: "legacy-body", type: "p", text: body });
  }
  const medias = Array.isArray(post.media) ? (post.media as BlogMedia[]) : [];
  medias.forEach((m, i) => {
    if (!m?.url || (m.type !== "image" && m.type !== "video")) return;
    result.push({
      id: `legacy-media-${i}`,
      type: m.type,
      url: m.url,
      path: m.path,
      title: (m as any).title ?? (m as any).caption ?? (m as any).alt ?? "",
    } as BlogBlock);
  });
  return result;
}

export default function BlogCard({
  post,
  onDelete,
  deleting,
  className,
}: Props) {
  const gradient = useThemeGradient();
  const gradientClass = typeof gradient === "string" ? gradient : "";
  const isDark = !!gradient && DARK_KEYS.some((k) => THEMES[k] === gradientClass);

  const blocks = toRenderableBlocks(post);

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-2xl shadow transition",
        gradientClass ? `bg-gradient-to-br ${gradientClass}` : "bg-white",
        isDark ? "border border-white/10 hover:shadow-md" : "border border-black/10 hover:shadow-md",
        className
      )}
    >
      <div className={clsx("p-4 space-y-4", isDark ? "text-white" : "text-black")}>
        {/* 記事タイトル */}
        <h3 className={clsx("font-semibold text-2xl leading-snug", isDark ? "text-white" : "text-black")}>
          {post.title}
        </h3>

        {/* 本文＆全メディアを順番に描画 */}
        <div className="space-y-4">
          {blocks.map((b, idx) => {
            if (b.type === "p") {
              return (
                <p
                  key={b.id ?? idx}
                  className={clsx(
                    "text-sm whitespace-pre-wrap leading-relaxed",
                    isDark ? "text-white/85" : "text-gray-700"
                  )}
                >
                  {(b as any).text || ""}
                </p>
              );
            }
            // 画像/動画
            const title =
              (b as any).title ?? (b as any).caption ?? (b as any).alt ?? "";
            return (
              <div key={b.id ?? idx} className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-black/10">
                  <ProductMedia
                    src={(b as any).url}
                    type={b.type}
                    className="w-full"
                    autoPlay
                    loop
                    muted
                  />
                </div>
                {title && (
                  <div className={clsx("text-xl", isDark ? "text-white/80" : "text-gray-700")}>
                    {title}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 作成日時 */}
        <div className={clsx("text-xs", isDark ? "text-white/70" : "text-gray-500")}>
          {post.createdAt?.toDate
            ? format(post.createdAt.toDate(), "yyyy/MM/dd HH:mm", { locale: ja })
            : ""}
        </div>

        {/* 操作行 */}
        <div className="pt-2 flex items-center gap-2">
          <Button asChild size="sm" variant={isDark ? "secondary" : "default"}>
            <Link href={`/blog/${post.id}/edit`}>
              <Pencil className="mr-1.5 h-4 w-4" />
              編集
            </Link>
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDelete?.(post)}
            disabled={deleting}
          >
            <Trash className="mr-1.5 h-4 w-4" />
            {deleting ? "削除中…" : "削除"}
          </Button>
        </div>
      </div>
    </article>
  );
}
