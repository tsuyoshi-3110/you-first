"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import PostCard, { Post } from "@/components/PostCard";
import PostForm from "@/components/PastForm";
import clsx from "clsx";

const LIMIT = 30;

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ログイン監視
  useEffect(() => auth.onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  // 最初の20件取得
  useEffect(() => {
    const fetchInitial = async () => {
      const base = collection(db, "posts");
      const q = mineOnly
        ? query(
            base,
            where("authorUid", "==", uid),
            orderBy("createdAt", "desc"),
            limit(LIMIT)
          )
        : query(base, orderBy("createdAt", "desc"), limit(LIMIT));

      const snap = await getDocs(q);
      const newPosts = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Post, "id">),
      }));
      setPosts(newPosts);
      setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === LIMIT);
    };

    if (!mineOnly || (mineOnly && uid)) {
      fetchInitial();
    }
  }, [mineOnly, uid]);

  // スクロール監視用 ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 追加読み込み処理
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastVisible) return;

    setLoadingMore(true);
    const base = collection(db, "posts");
    const q = mineOnly
      ? query(
          base,
          where("authorUid", "==", uid),
          orderBy("createdAt", "desc"),
          startAfter(lastVisible),
          limit(LIMIT)
        )
      : query(
          base,
          orderBy("createdAt", "desc"),
          startAfter(lastVisible),
          limit(LIMIT)
        );

    const snap = await getDocs(q);
    const newPosts = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Post, "id">),
    }));

    setPosts((prev) => [...prev, ...newPosts]);
    setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === LIMIT);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastVisible, mineOnly, uid]);

  // IntersectionObserver 監視
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.5 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-8 pb-28">
      {/* フィルタボタン */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setMineOnly(!mineOnly)}
          disabled={!uid}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            mineOnly
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-gray-300 text-gray-800 hover:bg-gray-400",
            !uid && "opacity-40 cursor-not-allowed"
          )}
        >
          {mineOnly ? "全ての投稿を表示" : "自分の投稿だけ"}
        </button>
      </div>

      {/* 投稿カード一覧 */}
      <div className="grid grid-cols-1 gap-6">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            表示できる投稿がありません
          </p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>

      {/* 追加ロード監視用 */}
      <div ref={sentinelRef} className="h-10" />

      {/* ローディングインジケーター */}
      {loadingMore && (
        <p className="text-center text-sm text-gray-400 mt-4">読み込み中...</p>
      )}

      {/* モーダル */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-center text-lg font-bold">新規投稿</h2>
            <PostForm />
            <button
              onClick={() => setShowForm(false)}
              className="mx-auto mt-4 block rounded-full bg-gray-500 px-6 py-2 text-sm text-white hover:bg-gray-600"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 新規投稿ボタン */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-green-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-600"
      >
        ＋ 新しい投稿
      </button>
    </div>
  );
}
