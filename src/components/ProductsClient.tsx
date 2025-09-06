"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import { v4 as uuid } from "uuid";
import imageCompression from "browser-image-compression";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  CollectionReference,
  DocumentData,
  writeBatch,
  limit,
  query,
  orderBy,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useThemeGradient } from "@/lib/useThemeGradient";
import clsx from "clsx";
import { ThemeKey, THEMES } from "@/lib/themes";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem from "./SortableItem";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { type Product } from "@/types/Product";
import ProductMedia from "./ProductMedia";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { Pin } from "lucide-react";

type MediaType = "image" | "video";
const MAX_ITEMS = 20;
const MAX_VIDEO_SEC = 60;

/* MIME */
const VIDEO_MIME_TYPES: string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg",
  "video/x-m4v",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/mpeg",
  "video/3gpp",
  "video/3gpp2",
];
const IMAGE_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/* ✅ ESLint対策のため外に出す */
const LANGS = [
  { key: "en", label: "英語", emoji: "🇺🇸" },
  { key: "zh", label: "中国語(簡体)", emoji: "🇨🇳" },
  { key: "zh-TW", label: "中国語(繁体)", emoji: "🇹🇼" },
  { key: "ko", label: "韓国語", emoji: "🇰🇷" },
  { key: "fr", label: "フランス語", emoji: "🇫🇷" },
  { key: "es", label: "スペイン語", emoji: "🇪🇸" },
  { key: "de", label: "ドイツ語", emoji: "🇩🇪" },
  { key: "pt", label: "ポルトガル語", emoji: "🇵🇹" },
  { key: "it", label: "イタリア語", emoji: "🇮🇹" },
  { key: "ru", label: "ロシア語", emoji: "🇷🇺" },
  { key: "th", label: "タイ語", emoji: "🇹🇭" },
  { key: "vi", label: "ベトナム語", emoji: "🇻🇳" },
  { key: "id", label: "インドネシア語", emoji: "🇮🇩" },
  { key: "hi", label: "ヒンディー語", emoji: "🇮🇳" },
  { key: "ar", label: "アラビア語", emoji: "🇸🇦" },
] as const;

export default function ProductsClient() {
  const [list, setList] = useState<Product[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  const [aiLoading, setAiLoading] = useState(false);
  const [showKeywordInput, setShowKeywordInput] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);

  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  /* ✅ 多国語UI */
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [translating, setTranslating] = useState(false);

  const [langQuery, setLangQuery] = useState("");
  const filteredLangs = useMemo(() => {
    if (!langQuery.trim()) return LANGS;
    const q = langQuery.trim().toLowerCase();
    return LANGS.filter(
      (l) =>
        l.label.toLowerCase().includes(q) || l.key.toLowerCase().includes(q)
    );
  }, [langQuery]);

  const gradient = useThemeGradient();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const isDark = useMemo(() => {
    const darkThemes: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkThemes.some((key) => gradient === THEMES[key]);
  }, [gradient]);

  const colRef: CollectionReference = useMemo(
    () => collection(db, "siteProducts", SITE_KEY, "items"),
    []
  );

  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  /* 編集モード時は既存値をプリセット */
  useEffect(() => {
    if (formMode === "edit" && editing) {
      setTitle(editing.title ?? "");
      setBody(editing.body ?? "");
    }
  }, [formMode, editing]);

  useEffect(() => {
    const q1 = query(colRef, orderBy("order"), limit(MAX_ITEMS));
    const unsub = onSnapshot(q1, (snap) => {
      const firstPage = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Product[];

      setList((prev) => {
        // 既存も含めて ID で一意化
        const map = new Map<string, Product>(prev.map((p) => [p.id, p]));
        firstPage.forEach((p) => map.set(p.id, p));
        // order 昇順で安全に並べ替え
        return [...map.values()].sort(
          (a, b) => (a.order ?? 9999) - (b.order ?? 9999)
        );
      });

      setLastVisible(snap.docs.at(-1) ?? null);
      setHasMore(snap.docs.length === MAX_ITEMS);
    });
    return () => unsub();
  }, [colRef]);

  const loadMore = useCallback(async () => {
    if (!lastVisible || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q2 = query(
        colRef,
        orderBy("order"),
        startAfter(lastVisible),
        limit(MAX_ITEMS)
      );
      const snap = await getDocs(q2);
      const nextPage = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Product[];

      setList((prev) => {
        const map = new Map<string, Product>(prev.map((p) => [p.id, p]));
        nextPage.forEach((p) => map.set(p.id, p));
        return [...map.values()].sort(
          (a, b) => (a.order ?? 9999) - (b.order ?? 9999)
        );
      });

      setLastVisible(snap.docs.at(-1) ?? null);
      setHasMore(snap.docs.length === MAX_ITEMS);
    } finally {
      setLoadingMore(false);
    }
  }, [colRef, lastVisible, loadingMore, hasMore]);

  useEffect(() => {
    const handleScroll = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
      if (nearBottom && !loadingMore && hasMore) loadMore();
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore, loadingMore, hasMore]);

  /* ✅ 翻訳→追記（タイトルは改行で追加） */
  const translateAndAppend = useCallback(
    async (langKey: (typeof LANGS)[number]["key"]) => {
      if (!title.trim() || !body.trim()) return;
      setTranslating(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, target: langKey }),
        });
        if (!res.ok) throw new Error("翻訳APIエラー");
        const data = (await res.json()) as { title: string; body: string };

        setTitle((prev) => `${prev}\n${data.title}`); // ← 改行追記
        setBody((prev) => `${prev}\n\n${data.body}`);

        setShowLangPicker(false);
      } catch (e) {
        console.error(e);
        alert("翻訳に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setTranslating(false);
      }
    },
    [title, body]
  );

  const saveProduct = async () => {
    if (uploading) return;
    if (!title.trim()) return alert("タイトル必須");
    if (formMode === "add" && !file) return alert("メディアを選択してください");

    try {
      const id = editing?.id ?? uuid();
      let mediaURL = editing?.mediaURL ?? "";
      let mediaType: MediaType = editing?.mediaType ?? "image";

      if (formMode === "add" && !file)
        return alert("メディアを選択してください");

      if (file) {
        const isVideo = file.type.startsWith("video/");
        mediaType = isVideo ? "video" : "image";

        const isValidVideo = VIDEO_MIME_TYPES.includes(file.type);
        const isValidImage = IMAGE_MIME_TYPES.includes(file.type);
        if (!isValidImage && !isValidVideo) {
          alert(
            "対応形式：画像（JPEG, PNG, WEBP, GIF）／動画（MP4, MOV, WebM 他）"
          );
          return;
        }

        const ext = isVideo
          ? file.type === "video/quicktime"
            ? "mov"
            : "mp4"
          : "jpg";

        const uploadFile = isVideo
          ? file
          : await imageCompression(file, {
              maxWidthOrHeight: 1200,
              maxSizeMB: 0.7,
              useWebWorker: true,
              fileType: "image/jpeg",
              initialQuality: 0.8,
            });

        const storageRef = ref(
          getStorage(),
          `products/public/${SITE_KEY}/${id}.${ext}`
        );
        const task = uploadBytesResumable(storageRef, uploadFile, {
          contentType: isVideo ? file.type : "image/jpeg",
        });

        setProgress(0);
        task.on("state_changed", (s) =>
          setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100))
        );
        await task;

        const downloadURL = await getDownloadURL(storageRef);
        if (!downloadURL) throw new Error("画像URLの取得に失敗しました");

        mediaURL = `${downloadURL}?v=${uuid()}`;
        setProgress(null);

        if (formMode === "edit" && editing) {
          const oldExt = editing.mediaType === "video" ? "mp4" : "jpg";
          if (oldExt !== ext) {
            await deleteObject(
              ref(getStorage(), `products/public/${SITE_KEY}/${id}.${oldExt}`)
            ).catch(() => {});
          }
        }
      }

      type ProductPayload = {
        title: string;
        body: string;
        mediaURL: string;
        mediaType: "image" | "video";
        originalFileName?: string;
      };

      const payload: ProductPayload = { title, body, mediaURL, mediaType };
      const originalFileName = file?.name || editing?.originalFileName;
      if (originalFileName) payload.originalFileName = originalFileName;

      if (formMode === "edit" && editing) {
        await updateDoc(doc(colRef, id), payload);
      } else {
        const q = query(colRef, orderBy("order"), limit(1));
        const snap = await getDocs(q);
        const first = snap.docs[0];
        const minOrder = first?.data()?.order ?? 0;

        await addDoc(colRef, {
          ...payload,
          createdAt: serverTimestamp(),
          order: minOrder - 1,
        });
      }

      closeForm();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。対応形式や容量をご確認ください。");
      setProgress(null);
    }
  };

  const openAdd = () => {
    if (uploading) return;
    resetFields();
    setFormMode("add");
  };

  const closeForm = () => {
    if (uploading) return;
    setTimeout(() => {
      resetFields();
      setFormMode(null);
    }, 100);
  };

  const resetFields = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setFile(null);
    setKeywords([]);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = list.findIndex((item) => item.id === active.id);
    const newIndex = list.findIndex((item) => item.id === over.id);
    const newList = arrayMove(list, oldIndex, newIndex);
    setList(newList);

    const batch = writeBatch(db);
    newList.forEach((item, index) => {
      batch.update(doc(colRef, item.id), { order: index });
    });
    await batch.commit();
  };

  if (!gradient) return null;

  return (
    <main className="max-w-5xl mx-auto p-4 pt-20">
      {uploading && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 gap-4">
          <p className="text-white">アップロード中… {progress}%</p>
          <div className="w-64 h-2 bg-gray-700 rounded">
            <div
              className="h-full bg-green-500 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {loadingMore && (
        <div className="text-center py-4 text-sm text-gray-500">
          読み込み中...
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={list.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-2 items-stretch">
            {list.map((p) => (
              <SortableItem key={p.id} product={p}>
                {({ listeners, attributes, isDragging }) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => {
                      if (isDragging) return;
                      router.push(`/products/${p.id}`);
                    }}
                    className={clsx(
                      "flex flex-col h-full border rounded-lg shadow-xl relative overflow-visible transition-colors duration-200",
                      "bg-gradient-to-b",
                      gradient,
                      isDragging
                        ? "bg-yellow-100"
                        : isDark
                        ? "bg-black/40 text-white"
                        : "bg-white",
                      "cursor-pointer",
                      !isDragging && "hover:shadow-lg"
                    )}
                  >
                    {auth.currentUser !== null && (
                      <div
                        {...attributes}
                        {...listeners}
                        // クリックだけ親に伝播させない（ドラッグは listeners に任せる）
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2
               z-30 cursor-grab active:cursor-grabbing select-none"
                      >
                        <div
                          className="w-10 h-10 rounded-full bg-white/95 border border-black/10
                    text-gray-700 text-sm flex items-center justify-center shadow-lg"
                        >
                          <Pin />
                        </div>
                      </div>
                    )}

                    <ProductMedia
                      src={p.mediaURL}
                      type={p.mediaType}
                      className="shadow-lg"
                    />

                    {/* 商品情報 */}
                    <div className="p-3 space-y-2">
                      {/* ✅ 改行をそのまま表示 */}
                      <h2
                        className={clsx(
                          "text-sm font-bold whitespace-pre-wrap",
                          {
                            "text-white": isDark,
                          }
                        )}
                      >
                        {p.title}
                      </h2>
                    </div>
                  </motion.div>
                )}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {isAdmin && formMode === null && (
        <button
          onClick={openAdd}
          aria-label="新規追加"
          disabled={uploading}
          className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg hover:bg-pink-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
        >
          <Plus size={28} />
        </button>
      )}

      {isAdmin && formMode && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">
              {formMode === "edit" ? "編集" : "新規追加"}
            </h2>

            {/* ✅ タイトルは改行可能に */}
            <input
              placeholder="タイトル（改行可）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />

            <textarea
              placeholder="本文"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              rows={4}
              disabled={uploading}
            />

            {!showKeywordInput ? (
              <button
                onClick={() => setShowKeywordInput(true)}
                className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2"
              >
                AIで本文を生成
              </button>
            ) : (
              <>
                {/* キーワード入力欄 */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    キーワード（1〜3個）
                  </p>
                  {[0, 1, 2].map((i) => (
                    <input
                      key={i}
                      type="text"
                      placeholder={`キーワード${i + 1}`}
                      value={keywords[i] || ""}
                      onChange={(e) => {
                        const newKeywords = [...keywords];
                        newKeywords[i] = e.target.value;
                        setKeywords(newKeywords.filter((k) => k.trim() !== ""));
                      }}
                      className="w-full border px-3 py-1 rounded"
                      disabled={uploading}
                    />
                  ))}
                </div>

                <button
                  onClick={async () => {
                    if (!title.trim())
                      return alert("タイトルを入力してください");
                    const validKeywords = keywords.filter(
                      (k) => k.trim() !== ""
                    );
                    if (validKeywords.length < 1)
                      return alert("キーワードを1つ以上入力してください");

                    setAiLoading(true);
                    try {
                      const res = await fetch("/api/generate-description", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title,
                          keywords: validKeywords,
                        }),
                      });
                      const data = await res.json();
                      if (data.body) {
                        setBody(data.body);
                        setKeywords([]);
                      } else {
                        alert("生成に失敗しました");
                      }
                    } catch {
                      alert("エラーが発生しました");
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={
                    uploading ||
                    aiLoading ||
                    keywords.filter((k) => k.trim()).length < 1
                  }
                  className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {aiLoading ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      <span>生成中…</span>
                    </>
                  ) : (
                    "生成する"
                  )}
                </button>
              </>
            )}

            <label>画像 / 動画 (60秒以内)</label>
            <input
              type="file"
              accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;

                const isVideo = f.type.startsWith("video/");
                if (!isVideo) {
                  setFile(f);
                  return;
                }

                const blobURL = URL.createObjectURL(f);
                const vid = document.createElement("video");
                vid.preload = "metadata";
                vid.src = blobURL;

                vid.onloadedmetadata = () => {
                  URL.revokeObjectURL(blobURL);
                  if (vid.duration > MAX_VIDEO_SEC) {
                    alert(`動画は ${MAX_VIDEO_SEC} 秒以内にしてください`);
                    (e.target as HTMLInputElement).value = "";
                    return;
                  }
                  setFile(f);
                };
              }}
              className="bg-gray-500 text-white w-full h-10 px-3 py-1 rounded"
              disabled={uploading}
            />
            {formMode === "edit" && editing?.originalFileName && (
              <p className="text-sm text-gray-600">
                現在のファイル: {editing.originalFileName}
              </p>
            )}

            {/* ✅ AIで多国語対応 */}
            {title.trim() && body.trim() && (
              <button
                onClick={() => setShowLangPicker(true)}
                className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
                disabled={uploading || aiLoading || translating}
              >
                AIで多国語対応
              </button>
            )}

            {/* ピッカー */}
            {showLangPicker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40"
                onClick={() => !translating && setShowLangPicker(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="w-full max-w-lg mx-4 rounded-2xl shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* ガラス風カード */}
                  <div className="rounded-2xl bg-white/90 backdrop-saturate-150 border border-white/50">
                    <div className="p-5 border-b border-black/5 flex items-center justify-between">
                      <h3 className="text-lg font-bold">言語を選択</h3>
                      <button
                        type="button"
                        onClick={() => setShowLangPicker(false)}
                        className="text-sm text-gray-500 hover:text-gray-800"
                        disabled={translating}
                      >
                        閉じる
                      </button>
                    </div>

                    {/* 検索 */}
                    <div className="px-5 pt-4">
                      <input
                        type="text"
                        value={langQuery}
                        onChange={(e) => setLangQuery(e.target.value)}
                        placeholder="言語名やコードで検索（例: フランス語 / fr）"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* グリッド */}
                    <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filteredLangs.map((lng) => (
                        <button
                          key={lng.key}
                          type="button"
                          onClick={() => translateAndAppend(lng.key)}
                          disabled={translating}
                          className={clsx(
                            "group relative rounded-xl border p-3 text-left transition",
                            "bg-white hover:shadow-lg hover:-translate-y-0.5",
                            "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                            "disabled:opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{lng.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {lng.label}
                              </div>
                              <div className="text-xs text-gray-500">
                                /{lng.key}
                              </div>
                            </div>
                          </div>
                          {/* 右上のアクセント */}
                          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-400 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      ))}
                      {filteredLangs.length === 0 && (
                        <div className="col-span-full text-center text-sm text-gray-500 py-6">
                          一致する言語が見つかりません
                        </div>
                      )}
                    </div>

                    {/* フッター */}
                    <div className="px-5 pb-5">
                      <button
                        type="button"
                        onClick={() => setShowLangPicker(false)}
                        className="w-full rounded-lg px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700"
                        disabled={translating}
                      >
                        キャンセル
                      </button>
                    </div>

                    {/* ローディングバー（翻訳中のわかりやすい表示） */}
                    {translating && (
                      <div className="h-1 w-full overflow-hidden rounded-b-2xl">
                        <div className="h-full w-1/2 animate-[progress_1.2s_ease-in-out_infinite] bg-indigo-500" />
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={saveProduct}
                disabled={uploading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {formMode === "edit" ? "更新" : "追加"}
              </button>
              <button
                onClick={closeForm}
                disabled={uploading}
                className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
