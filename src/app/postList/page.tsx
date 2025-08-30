"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  where,
  limit as qLimit,
  startAfter,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
  deleteField,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import clsx from "clsx";
import Image from "next/image";
// 実際のパス/ファイル名に合わせてください
import PostForm from "@/components/PastForm";
import {
  getStorage,
  ref,
  deleteObject,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

/* ---- メディア許容 & 制限 ---- */
const ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const MAX_VIDEO_SEC = 60; // 1分

const LIMIT = 30;

/* Firestore の Post 形（古いデータ互換も考慮） */
type Post = {
  id: string;
  content: string;
  authorName: string;
  authorIconUrl: string;
  authorSiteKey: string;
  authorUid: string;
  likeCount?: number;
  createdAt?: Timestamp;
  mediaUrl?: string;
  mediaType?: "image" | "video" | null;
  imageUrl?: string; // 旧互換
};

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  // ページング管理
  const [lastCursor, setLastCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<Post | null>(null);
  const [editText, setEditText] = useState("");

  // 編集用 メディア差し替え
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editIsVideo, setEditIsVideo] = useState(false);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | undefined>(undefined);

  // 編集アップロード進捗
  const [editUploadPct, setEditUploadPct] = useState<number | null>(null);
  const [editTask, setEditTask] =
    useState<ReturnType<typeof uploadBytesResumable> | null>(null);

  // ログイン監視
  useEffect(() => auth.onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  // ── リアルタイム：最新 LIMIT 件を購読（mineOnly/uid 変化で貼り替え）
  useEffect(() => {
    if (mineOnly && !uid) {
      setPosts([]);
      setHasMore(false);
      setLastCursor(null);
      return;
    }

    const base = collection(db, "posts");
    const q = mineOnly
      ? query(
          base,
          where("authorUid", "==", uid),
          orderBy("createdAt", "desc"),
          qLimit(LIMIT)
        )
      : query(base, orderBy("createdAt", "desc"), qLimit(LIMIT));

    const unsub = onSnapshot(q, (snap) => {
      const head: Post[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Post, "id">),
      }));
      const headIds = new Set(head.map((h) => h.id));

      setPosts((prev) => {
        const tail = prev.filter((p) => !headIds.has(p.id));
        return [...head, ...tail];
      });

      setLastCursor(snap.docs.at(-1) ?? null);
      setHasMore(snap.size === LIMIT);
    });

    return () => unsub();
  }, [mineOnly, uid]);

  // スクロール監視用 ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 追加読み込み（古い方のページを静的に）
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastCursor) return;

    setLoadingMore(true);
    const base = collection(db, "posts");
    const q = mineOnly
      ? query(
          base,
          where("authorUid", "==", uid),
          orderBy("createdAt", "desc"),
          startAfter(lastCursor),
          qLimit(LIMIT)
        )
      : query(
          base,
          orderBy("createdAt", "desc"),
          startAfter(lastCursor),
          qLimit(LIMIT)
        );

    const snap = await getDocs(q);
    const page: Post[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Post, "id">),
    }));

    setPosts((prev) => {
      const exists = new Set(prev.map((p) => p.id));
      const dedup = page.filter((p) => !exists.has(p.id));
      return [...prev, ...dedup];
    });

    setLastCursor(snap.docs.at(-1) ?? null);
    setHasMore(snap.size === LIMIT);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastCursor, mineOnly, uid]);

  // IntersectionObserver 監視
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { threshold: 0.5 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  // プレビューURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    };
  }, [editPreviewUrl]);

  /* ===== 編集・削除 ===== */
  const openEdit = (post: Post) => {
    setEditTarget(post);
    setEditText(post.content ?? "");
    setEditPreviewUrl(undefined);
    setEditFile(null);
    setEditIsVideo(false);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditText("");
    setEditFile(null);
    setEditPreviewUrl(undefined);
    setEditIsVideo(false);
    setEditUploadPct(null);
    setEditTask(null);
  };

  const handlePickEditFile = (f: File | null) => {
    if (!f) {
      setEditFile(null);
      setEditPreviewUrl(undefined);
      setEditIsVideo(false);
      return;
    }
    const type = f.type;
    const isImg = ALLOWED_IMG.includes(type);
    const isVid = ALLOWED_VIDEO.includes(type);
    if (!isImg && !isVid) {
      alert("対応していないファイル形式です（画像: jpg/png/webp/gif、動画: mp4/webm/ogg/quicktime）");
      return;
    }
    const blobUrl = URL.createObjectURL(f);

    if (isVid) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = blobUrl;
      v.onloadedmetadata = () => {
        const sec = v.duration ?? 0;
        if (sec > MAX_VIDEO_SEC) {
          alert("動画は1分（60秒）以内にしてください。");
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setEditFile(f);
        setEditIsVideo(true);
        setEditPreviewUrl(blobUrl);
      };
      return;
    }

    setEditFile(f);
    setEditIsVideo(false);
    setEditPreviewUrl(blobUrl);
  };

  const saveEdit = async () => {
    if (!editTarget) return;

    try {
      // 1) 本文だけ先に更新
      await updateDoc(doc(db, "posts", editTarget.id), {
        content: editText.trim(),
        updatedAt: serverTimestamp(),
      });

      // 2) メディア差し替えがある場合
      if (editFile) {
        setEditUploadPct(0);

        const storage = getStorage();
        const storageRef = ref(storage, `posts/${editTarget.id}/${editFile.name}`);
        const task = uploadBytesResumable(storageRef, editFile);
        setEditTask(task);

        const newUrl: string = await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (s) => {
              const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
              setEditUploadPct(pct);
            },
            reject,
            async () => resolve(await getDownloadURL(task.snapshot.ref))
          );
        });

        // Firestore を新URLで更新
        await updateDoc(doc(db, "posts", editTarget.id), {
          mediaUrl: newUrl,
          mediaType: editIsVideo ? "video" : "image",
          ...(editIsVideo ? { imageUrl: deleteField() } : { imageUrl: newUrl }),
          updatedAt: serverTimestamp(),
        });

        // 旧オブジェクトは後で削除（失敗は握りつぶし）
        const oldUrl = editTarget.mediaUrl || editTarget.imageUrl;
        if (oldUrl) {
          try {
            await deleteObject(ref(storage, oldUrl));
          } catch {}
        }
      }

      // 3) ローカル即時反映
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== editTarget.id) return p;

          const base: Post = { ...p, content: editText.trim() };
          if (!editFile) return base;

          const tempUrl: string | undefined =
            editPreviewUrl ?? p.mediaUrl ?? p.imageUrl ?? undefined;

          return {
            ...base,
            mediaType: editIsVideo ? "video" : "image",
            mediaUrl: tempUrl,
            ...(editIsVideo ? { imageUrl: undefined } : { imageUrl: tempUrl }),
          };
        })
      );

      closeEdit();
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました");
      setEditUploadPct(null);
    }
  };

  const deletePost = async (post: Post) => {
    if (!confirm("この投稿を削除しますか？")) return;
    try {
      await deleteDoc(doc(db, "posts", post.id));
      const storage = getStorage();
      const targetUrl = post.mediaUrl || post.imageUrl;
      if (targetUrl) {
        try {
          await deleteObject(ref(storage, targetUrl));
        } catch {}
      }
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-8 pb-28">
      {/* フィルタボタン */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setMineOnly((v) => !v)}
          disabled={!uid}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            mineOnly
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-gray-300 text-gray-800 hover:bg-gray-400",
            !uid && "cursor-not-allowed opacity-40"
          )}
        >
          {mineOnly ? "全ての投稿を表示" : "自分の投稿だけ"}
        </button>
      </div>

      {/* 投稿カード一覧（画像/動画対応） */}
      <div className="grid grid-cols-1 gap-6">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-gray-500">表示できる投稿がありません</p>
        ) : (
          posts.map((p) => (
            <Card key={p.id} post={p} myUid={uid} onEdit={openEdit} onDelete={deletePost} />
          ))
        )}
      </div>

      {/* 追加ロード監視用 */}
      <div ref={sentinelRef} className="h-10" />

      {/* ローディングインジケーター */}
      {loadingMore && (
        <p className="mt-4 text-center text-sm text-gray-400">読み込み中...</p>
      )}

      {/* 新規投稿モーダル（中央配置＋中身スクロール） */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
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

      {/* 編集モーダル（中央配置＋中身スクロール） */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-center text-lg font-bold">投稿を編集</h3>

            {/* 本文 */}
            <textarea
              className="h-40 w-full rounded border p-2"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />

            {/* ファイル選択 */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded bg-gray-200 px-3 py-1 text-sm">
                画像/動画を選択して差し替え
                <input
                  type="file"
                  accept={[...ALLOWED_IMG, ...ALLOWED_VIDEO].join(",")}
                  className="hidden"
                  onChange={(e) => handlePickEditFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {editFile && (
                <span className="max-w-[40ch] truncate text-xs text-gray-600">
                  選択中: {editFile.name}
                </span>
              )}
              {editFile && (
                <button
                  type="button"
                  onClick={() => handlePickEditFile(null)}
                  className="rounded bg-gray-300 px-3 py-1 text-xs hover:bg-gray-400"
                >
                  取り消し
                </button>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeEdit}
                className="rounded bg-gray-300 px-4 py-2 text-sm hover:bg-gray-400"
              >
                キャンセル
              </button>
              <button
                onClick={saveEdit}
                disabled={editUploadPct !== null}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>

          {/* 編集時アップロード進捗（中央配置） */}
          {editUploadPct !== null && (
            <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
              <div className="w-80 max-w-[90vw] rounded-xl bg-white p-4 shadow-xl">
                <p className="mb-2 text-center text-sm font-medium text-gray-800">
                  アップロード中… {editUploadPct}%
                </p>
                <div className="h-3 w-full rounded bg-gray-200">
                  <div
                    className="h-full rounded bg-blue-500 transition-all"
                    style={{ width: `${editUploadPct}%` }}
                  />
                </div>
                {editTask?.snapshot.state === "running" && (
                  <button
                    type="button"
                    onClick={() => editTask.cancel()}
                    className="mx-auto mt-3 block text-xs text-red-600 hover:underline"
                  >
                    キャンセル
                  </button>
                )}
              </div>
            </div>
          )}
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

/* ====== 単一カード（画像/動画レンダリング込み & 自分の投稿は編集/削除）====== */
function Card({
  post,
  myUid,
  onEdit,
  onDelete,
}: {
  post: Post;
  myUid: string | null;
  onEdit: (p: Post) => void;
  onDelete: (p: Post) => void;
}) {
  const isVideo = post.mediaType === "video" && !!post.mediaUrl;
  const isImage =
    (post.mediaType === "image" && !!post.mediaUrl) ||
    (!post.mediaType && !!post.imageUrl);
  const mediaUrl = isVideo ? post.mediaUrl! : post.mediaUrl || post.imageUrl;

  const isMine = !!myUid && post.authorUid === myUid;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow">
      {/* ヘッダー：アイコン＋名前＋時間 */}
      <header className="mb-3 flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0">
          <Image
            src={post.authorIconUrl || "/noImage.png"}
            alt={post.authorName || "user"}
            fill
            sizes="40px"
            className="rounded-full object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {post.authorName || "Anonymous"}
          </p>
          {post.createdAt?.toDate && (
            <p className="text-xs text-gray-500">
              {post.createdAt.toDate().toLocaleString()}
            </p>
          )}
        </div>

        {/* 自分の投稿だけ操作ボタン */}
        {isMine && (
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(post)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
            >
              編集
            </button>
            <button
              onClick={() => onDelete(post)}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
            >
              削除
            </button>
          </div>
        )}
      </header>

      {/* 本文 */}
      <p className="whitespace-pre-wrap text-sm text-gray-800">{post.content}</p>

      {/* メディア（動画優先 → 画像） */}
      {mediaUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
          {isVideo ? (
            <video src={mediaUrl} className="h-auto w-full" controls playsInline />
          ) : isImage ? (
            <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
              <Image
                src={mediaUrl}
                alt="attachment"
                fill
                sizes="100vw"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
