"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
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

import { type Product } from "@/types/Product";

type MediaType = "image" | "video";

const SITE_KEY = "youFirst";
const MAX_ITEMS = 30;

export default function ProductsClient() {
  const [list, setList] = useState<Product[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // const [price, setPrice] = useState<number | "">("");
  // const [taxIncluded, setTaxIncluded] = useState(true); // デフォルト税込
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const [showKeywordInput, setShowKeywordInput] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);

  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const gradient = useThemeGradient();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
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

  // const jaCollator = useMemo(
  //   () => new Intl.Collator("ja-JP", { numeric: true, sensitivity: "base" }),
  //   []
  // );

  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  // 最大 30 件取得（リアルタイム）
  useEffect(() => {
    const q = query(colRef, orderBy("order"), limit(MAX_ITEMS));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];

      setList(docs);
      setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === MAX_ITEMS);
    });

    return () => unsub();
  }, [colRef]);

  const loadMore = useCallback(async () => {
    if (!lastVisible || loadingMore) return;

    setLoadingMore(true);

    const q = query(
      colRef,
      orderBy("order"),
      startAfter(lastVisible),
      limit(MAX_ITEMS)
    );

    const snap = await getDocs(q);

    // 現在表示中のIDセットを作成
    const existingIds = new Set(list.map((item) => item.id));

    // 取得した新しいドキュメントのうち、既に存在していないものだけ抽出
    const newDocs = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => !existingIds.has(item.id)) as Product[];

    // 新しいものだけ追加
    setList((prev) => [...prev, ...newDocs]);
    setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === MAX_ITEMS);
    setLoadingMore(false);
  }, [lastVisible, loadingMore, colRef, list]);

  useEffect(() => {
    const handleScroll = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

      if (nearBottom && !loadingMore && hasMore) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore, loadingMore, hasMore]);

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

        const isValidImage =
          file.type === "image/jpeg" || file.type === "image/png";
        const isValidVideo =
          file.type === "video/mp4" || file.type === "video/quicktime";

        if (!isValidImage && !isValidVideo) {
          alert("対応形式：画像（JPEG, PNG）／動画（MP4, MOV）");
          return;
        }

        if (isVideo && file.size > 50 * 1024 * 1024) {
          alert("動画サイズは50MB未満にしてください");
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

      const payload: ProductPayload = {
        title,
        body,
        mediaURL,
        mediaType,
      };

      const originalFileName = file?.name || editing?.originalFileName;
      if (originalFileName) {
        payload.originalFileName = originalFileName;
      }

      if (formMode === "edit" && editing) {
        await updateDoc(doc(colRef, id), payload);
      } else {
        // 最も小さいorderを取得して先頭にする
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
    }, 100); // 少しだけ遅延させるとUIフリーズ対策になる
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
            {list.map((p) => {
              const isLoaded = loadedIds.has(p.id);
              return (
                <SortableItem key={p.id} product={p}>
                  {({ listeners, attributes, isDragging }) => (
                    <div
                      onClick={() => {
                        // 管理者編集中やドラッグ中は遷移させない
                        if (isDragging) return;
                        router.push(`/products/${p.id}`);
                      }}
                      className={clsx(
                        // --- 既存 ---
                        "flex flex-col h-full border rounded-lg overflow-hidden shadow relative transition-colors duration-200",
                        "bg-gradient-to-b",
                        gradient,
                        isDragging
                          ? "bg-yellow-100"
                          : isDark
                          ? "bg-black/40 text-white"
                          : "bg-white",
                        // --- ★ 追加ここだけ ★ ---
                        // 管理者（ドラッグできる人）は常に grab カーソル。
                        // それ以外の閲覧者には pointer カーソルを表示。
                        "cursor-pointer",
                        // hover で軽く陰影を強調（任意）
                        !isDragging && "hover:shadow-lg"
                      )}
                    >
                      {auth.currentUser !== null && (
                        <div
                          {...attributes}
                          {...listeners}
                          onTouchStart={(e) => e.preventDefault()}
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing touch-none select-none"
                        >
                          <div className="w-10 h-10 bg-gray-200 text-gray-700 rounded-full text-sm flex items-center justify-center shadow">
                            ≡
                          </div>
                        </div>
                      )}

                      {!isLoaded && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
                          <svg
                            className="w-8 h-8 animate-spin text-pink-600"
                            viewBox="0 0 24 24"
                            fill="none"
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
                        </div>
                      )}

                      {/* メディア表示 */}
                      {p.mediaType === "image" ? (
                        <div className="relative w-full aspect-[1/1] sm:aspect-square">
                          <Image
                            src={p.mediaURL}
                            alt={p.title}
                            fill
                            className="object-cover"
                            sizes="(min-width:1024px) 320px, (min-width:640px) 45vw, 90vw"
                            onLoad={() =>
                              setLoadedIds((prev) => new Set(prev).add(p.id))
                            }
                          />
                        </div>
                      ) : (
                        <div className="relative w-full aspect-[1/1] sm:aspect-square">
                          <video
                            src={p.mediaURL}
                            muted
                            playsInline
                            autoPlay
                            loop
                            preload="auto"
                            className="w-full h-full object-cover absolute top-0 left-0"
                            onLoadedData={() =>
                              setLoadedIds((prev) => new Set(prev).add(p.id))
                            }
                          />
                        </div>
                      )}

                      {/* 商品情報 */}
                      <div className="p-1 space-y-1">
                        <h2
                          className={clsx("text-sm font-bold", {
                            "text-white": isDark,
                          })}
                        >
                          {p.title}
                        </h2>
                      </div>
                    </div>
                  )}
                </SortableItem>
              );
            })}
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

            <input
              type="text"
              placeholder="タイトル"
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

            <input
              type="file"
              accept="image/*,video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="bg-gray-500 text-white w-full h-10 px-3 py-1 rounded"
              disabled={uploading}
            />
            {formMode === "edit" && editing?.originalFileName && (
              <p className="text-sm text-gray-600">
                現在のファイル: {editing.originalFileName}
              </p>
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
