// app/blog/page.tsx
"use client";

import {
  collection,
  query,
  orderBy,
  limit as fbLimit,
  getDocs,
  startAfter,
  doc,
  deleteDoc,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { BlogPost } from "@/types/blog";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import BlogCard from "@/components/blog/BlogCard";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import { deleteObject, ref as storageRef } from "firebase/storage";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";

const PAGE_SIZE = 20;

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [cursor, setCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // ===== テーマの判定 =====
  const gradient = useThemeGradient();
  const isDark = useMemo(() => {
    const darkKeys: ThemeKey[] = ["brandG", "brandH", "brandI"];
    return gradient && darkKeys.some((k) => gradient === THEMES[k]);
  }, [gradient]);

  const fetchPage = useCallback(
    async (firstLoad = false) => {
      if (!SITE_KEY || loading || noMore) return;
      setLoading(true);
      try {
        const col = collection(db, "siteBlogs", SITE_KEY, "posts");
        const base = query(
          col,
          orderBy("createdAt", "desc"),
          fbLimit(PAGE_SIZE)
        );

        const q = cursor
          ? query(
              col,
              orderBy("createdAt", "desc"),
              startAfter(cursor),
              fbLimit(PAGE_SIZE)
            )
          : base;

        const snap = await getDocs(q);
        if (snap.empty) {
          setNoMore(true);
          return;
        }

        const items: BlogPost[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setPosts((prev) => (firstLoad ? items : [...prev, ...items]));
        setCursor(snap.docs[snap.docs.length - 1] ?? null);

        if (snap.size < PAGE_SIZE) setNoMore(true);
      } finally {
        setLoading(false);
      }
    },
    [cursor, loading, noMore]
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setNoMore(false);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SITE_KEY]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting) {
          fetchPage(false);
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchPage]);

  const handleDelete = async (post: BlogPost) => {
    if (!SITE_KEY || !post?.id) return;
    if (!confirm("この記事を削除しますか？（メディアも削除されます）")) return;

    setDeletingId(post.id);
    try {
      // --- blocks 内のメディア（新仕様）を削除 ---
      const blocks = Array.isArray((post as any).blocks)
        ? (post as any).blocks
        : [];
      for (const b of blocks) {
        if ((b?.type === "image" || b?.type === "video") && b?.path) {
          try {
            await deleteObject(storageRef(storage, b.path));
          } catch {}
        }
      }

      // --- 旧仕様 media 配列も後方互換で削除 ---
      const medias = Array.isArray((post as any).media)
        ? (post as any).media
        : [];
      for (const m of medias) {
        if (m?.path) {
          try {
            await deleteObject(storageRef(storage, m.path));
          } catch {}
        }
      }

      await deleteDoc(doc(db, "siteBlogs", SITE_KEY, "posts", post.id));
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className={clsx(
            "text-xl font-bold",
            isDark ? "text-white" : "text-black"
          )}
        >
          ブログ
        </h1>
      </div>

      {posts.length === 0 && !loading ? (
        <p
          className={clsx(
            "text-sm",
            isDark ? "text-white/70" : "text-muted-foreground"
          )}
        >
          まだ投稿がありません。
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-1 justify-items-center">
            {posts.map((p) => (
              <BlogCard
                key={p.id}
                post={p}
                onDelete={handleDelete}
                deleting={deletingId === p.id}
                className="w-[90%]"
              />
            ))}
          </div>

          <div
            className={clsx(
              "flex justify-center py-4 text-sm",
              isDark ? "text-white/70" : "text-muted-foreground"
            )}
          >
            {loading && "読み込み中…"}
          </div>

          <div ref={sentinelRef} className="h-6" />
        </>
      )}

      {/* 右下固定の + ボタン */}
      {user && (
        <Link
          href="/blog/new"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-transform transform hover:scale-110 active:scale-95"
        >
          <span className="text-3xl leading-none">＋</span>
        </Link>
      )}
    </div>
  );
}
