"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { Pin, Plus } from "lucide-react";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  CollectionReference,
  DocumentData,
  writeBatch,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { FieldValue } from "firebase/firestore";
import { useThemeGradient } from "@/lib/useThemeGradient";
import clsx from "clsx";
import { ThemeKey, THEMES } from "@/lib/themes";
import { Button } from "./ui/button";
import CardSpinner from "./CardSpinner";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, useInView } from "framer-motion";

/* 多言語候補 */
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
type LangKey = (typeof LANGS)[number]["key"];

const STORE_COL = `siteStores/${SITE_KEY}/items`;
const STORAGE_PATH = `stores/public/${SITE_KEY}`;

type Store = {
  id: string;
  name: string;
  address: string;
  description: string;
  imageURL: string;
  originalFileName?: string;
  order?: number;
};

export default function StoresClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  // 入力
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");

  // 画像
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  // AI 紹介文
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiKeyword, setAiKeyword] = useState("");
  const [aiFeature, setAiFeature] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // 多言語ピッカー
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const [translating, setTranslating] = useState(false);

  // 追記時の重複・同時実行ガード
  const inFlightRef = useRef(false);
  const doneLangsRef = useRef<Set<LangKey>>(new Set());
  const baseNameRef = useRef<string>("");
  const baseDescRef = useRef<string>("");
  const baseAddrRef = useRef<string>("");

  const [submitFlag, setSubmitFlag] = useState(false);

  const gradient = useThemeGradient();
  const isDark = useMemo(() => {
    const darkThemes: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkThemes.some((k) => gradient === THEMES[k]);
  }, [gradient]);

  const colRef: CollectionReference<DocumentData> = useMemo(
    () => collection(db, STORE_COL),
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stores.findIndex((s) => s.id === active.id);
    const newIndex = stores.findIndex((s) => s.id === over.id);
    const newList = arrayMove(stores, oldIndex, newIndex);
    setStores(newList);
    const batch = writeBatch(db);
    newList.forEach((s, i) =>
      batch.update(doc(db, STORE_COL, s.id), { order: i })
    );
    await batch.commit();
  };

  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  useEffect(() => {
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            name: data.name,
            address: data.address,
            description: data.description ?? "",
            imageURL: data.imageURL,
            originalFileName: data.originalFileName,
            order: data.order ?? 9999,
          } as Store;
        });
        docs.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
        setStores(docs);
      },
      (e) => console.error(e)
    );
    return () => unsub();
  }, [colRef]);

  /* ===== 多言語ユーティリティ ===== */
  const filteredLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return LANGS;
    return LANGS.filter(
      (l) =>
        l.label.toLowerCase().includes(q) || l.key.toLowerCase().includes(q)
    );
  }, [langQuery]);

  const norm = (s: string) => (s ?? "").replace(/\r/g, "").trim();
  const hasSameLine = (text: string, candidate: string) => {
    const lines = norm(text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const c = norm(candidate);
    return !!c && lines.includes(c);
  };
  const containsParagraph = (text: string, paragraph: string) =>
    !!norm(paragraph) && norm(text).includes(norm(paragraph));
  const firstLine = (s: string) => (s || "").split("\n")[0]?.trim() ?? "";
  const firstParagraph = (s: string) =>
    (s || "").split(/\n{2,}/)[0]?.trim() ?? "";

  const openLang = () => {
    if (!name.trim() && !description.trim() && !address.trim()) {
      alert("店舗名・住所・紹介文のいずれかを入力してください");
      return;
    }
    baseNameRef.current = firstLine(name);
    baseDescRef.current = firstParagraph(description);
    baseAddrRef.current = (address ?? "").replace(/\r/g, "").trim();
    doneLangsRef.current = new Set();
    inFlightRef.current = false;
    setLangQuery("");
    setShowLangPicker(true);
  };

  const translateOnce = async (
    title: string,
    body: string,
    target: LangKey
  ) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, target }),
    });
    if (!res.ok) throw new Error("翻訳APIエラー");
    return (await res.json()) as { title?: string; body?: string };
  };

  const translateAndAppend = async (target: LangKey) => {
    if (inFlightRef.current) return;
    if (doneLangsRef.current.has(target)) return;
    inFlightRef.current = true;
    try {
      setTranslating(true);

      // 店名＋紹介文
      if (baseNameRef.current || baseDescRef.current) {
        const data = await translateOnce(
          baseNameRef.current,
          baseDescRef.current || " ",
          target
        );
        const tTitle = norm(data.title ?? "");
        const tBody = norm(data.body ?? "");
        if (
          tTitle &&
          tTitle !== norm(baseNameRef.current) &&
          !hasSameLine(name, tTitle)
        ) {
          setName((prev) => (prev ? `${prev}\n${tTitle}` : tTitle));
        }
        if (tBody && !containsParagraph(description, tBody)) {
          setDescription((prev) => (prev ? `${prev}\n\n${tBody}` : tBody));
        }
      }

      // 住所（原文全文→翻訳1行を末尾に追記）
      if (baseAddrRef.current) {
        const addrData = await translateOnce(baseAddrRef.current, " ", target);
        const tAddr = norm(addrData.title ?? "");
        if (
          tAddr &&
          tAddr !== norm(baseAddrRef.current) &&
          !hasSameLine(address, tAddr)
        ) {
          setAddress((prev) => (prev ? `${prev}\n${tAddr}` : tAddr));
        }
      }

      doneLangsRef.current.add(target);
      setShowLangPicker(false);
    } catch (e) {
      console.error(e);
      alert("翻訳に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setTranslating(false);
      inFlightRef.current = false;
    }
  };

  /* ===== CRUD ===== */
  const openAdd = () => {
    setEditingStore(null);
    setName("");
    setAddress("");
    setDescription("");
    setFile(null);
    setFormMode("add");
  };

  const openEdit = (s: Store) => {
    setEditingStore(s);
    setName(s.name);
    setAddress(s.address);
    setDescription(s.description ?? "");
    setFile(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (uploading) return;
    setFormMode(null);
  };

  const saveStore = async () => {
    if (!name.trim() || !address.trim()) {
      return alert("名前と住所は必須です");
    }
    try {
      setSubmitFlag(true);

      const isEdit = formMode === "edit" && !!editingStore;

      // FirestoreのdocRefを先に確保（新規時はID発行のみ）
      const docRef = isEdit
        ? doc(colRef, editingStore!.id)
        : doc(colRef); // ← ここで一意IDを発行

      const id = docRef.id; // ← StorageもこのIDに統一
      let imageURL = isEdit ? editingStore!.imageURL || "" : "";
      const originalFileName =
        file?.name ?? editingStore?.originalFileName ?? "";

      // 画像アップロード（必要時）
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const allowedExts = ["jpg", "jpeg", "png", "webp"];
        if (!allowedExts.includes(ext)) {
          alert("サポートされていない画像形式です");
          return;
        }

        const sref = storageRef(getStorage(), `${STORAGE_PATH}/${id}.${ext}`);
        const task = uploadBytesResumable(sref, file, {
          contentType: file.type,
        });
        setProgress(0);

        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (s) =>
              setProgress(
                Math.round((s.bytesTransferred / s.totalBytes) * 100)
              ),
            (e) => {
              console.error(e);
              alert("画像アップロードに失敗しました");
              setProgress(null);
              reject(e);
            },
            async () => {
              try {
                imageURL = await getDownloadURL(task.snapshot.ref);
                // storage endpoint 固定
                imageURL = imageURL.replace(
                  "crepe-shop-homepage.appspot.com",
                  "crepe-shop-homepage.firebasestorage.app"
                );
                setProgress(null);

                // 旧拡張子の掃除（編集時のみ）
                if (isEdit && editingStore) {
                  const oldExt =
                    editingStore.imageURL.split(".").pop()?.toLowerCase() || "";
                  if (oldExt && oldExt !== ext) {
                    await deleteObject(
                      storageRef(getStorage(), `${STORAGE_PATH}/${id}.${oldExt}`)
                    ).catch(() => {});
                  }
                }
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      }

      // Firestore 反映
      const payload: {
        name: string;
        address: string;
        description?: string;
        imageURL: string;
        updatedAt: FieldValue;
        originalFileName?: string;
      } = {
        name,
        address,
        ...(description.trim() && { description }),
        imageURL,
        updatedAt: serverTimestamp(),
        ...(originalFileName && { originalFileName }),
      };

      if (isEdit) {
        await updateDoc(docRef, payload);
      } else {
        // 新規：order を末尾に設定
        const nextOrder = (stores.at(-1)?.order ?? stores.length - 1) + 1;
        await setDoc(docRef, {
          ...payload,
          createdAt: serverTimestamp(),
          order: nextOrder,
        });
      }

      closeForm();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
      setProgress(null);
    } finally {
      setSubmitFlag(false);
    }
  };

  const removeStore = async (s: Store) => {
    if (!confirm(`「${s.name}」を削除しますか？`)) return;
    try {
      await deleteDoc(doc(colRef, s.id));
      if (s.imageURL) {
        const ext = s.imageURL.split(".").pop()?.toLowerCase();
        const allowedExts = ["jpg", "jpeg", "png", "webp"];
        if (ext && allowedExts.includes(ext)) {
          const fileRef = storageRef(
            getStorage(),
            `${STORAGE_PATH}/${s.id}.${ext}`
          );
          await deleteObject(fileRef).catch((err) => {
            console.warn("画像の削除に失敗しました:", err);
          });
        }
      }
    } catch (err) {
      console.error("削除に失敗しました:", err);
      alert("削除中にエラーが発生しました");
    }
  };

  if (!gradient) return <CardSpinner />;

  return (
    <main className="max-w-5xl mx-auto p-4 mt-20">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stores.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((s) => (
              <SortableStoreItem key={s.id} store={s}>
                {({ attributes, listeners, isDragging }) => (
                  <StoreCard
                    store={s}
                    isAdmin={isAdmin}
                    isDragging={isDragging}
                    isDark={isDark}
                    gradient={gradient!}
                    listeners={listeners}
                    attributes={attributes}
                    onEdit={openEdit}
                    onRemove={removeStore}
                  />
                )}
              </SortableStoreItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 新規追加 */}
      {isAdmin && formMode === null && (
        <button
          onClick={openAdd}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 cursor-pointer rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg hover:bg-pink-700 active:scale-95 transition disabled:opacity-50"
        >
          <Plus size={28} />
        </button>
      )}

      {/* フォームモーダル */}
      {isAdmin && formMode && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold text-center">
              {formMode === "edit" ? "店舗を編集" : "店舗を追加"}
            </h2>

            {/* 店名（改行可） */}
            <textarea
              placeholder="店舗名（改行可）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border px-3 py-2 rounded whitespace-pre-wrap"
              rows={2}
              disabled={uploading}
            />

            {/* 住所（改行可） */}
            <textarea
              placeholder="住所（改行可）"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border px-3 py-2 rounded whitespace-pre-wrap"
              rows={2}
              disabled={uploading}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                （任意）紹介文
              </label>
              <textarea
                placeholder="紹介文"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border px-3 py-2 rounded whitespace-pre-wrap"
                rows={3}
                disabled={uploading}
              />
            </div>

            {/* AI紹介文 */}
            <button
              onClick={() => {
                if (!name.trim() || !address.trim()) {
                  alert("店舗名と住所を入力してください");
                  return;
                }
                setShowAIModal(true);
              }}
              disabled={uploading || aiLoading}
              className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
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
                  <span>生成中…</span>
                </>
              ) : (
                "AIで紹介文を生成"
              )}
            </button>

            {/* 多言語対応 */}
            {(name.trim() || address.trim() || description.trim()) && (
              <button
                onClick={openLang}
                className="w-full mt-2 px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
                disabled={uploading || aiLoading || translating}
              >
                AIで多国語対応
              </button>
            )}

            {/* AIモーダル */}
            {showAIModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-6 w-full max-w-sm space-y-4">
                  <h3 className="text-lg font-semibold text-center">
                    紹介文をAIで生成
                  </h3>

                  <input
                    type="text"
                    placeholder="何の店舗か？（例: クレープ屋）"
                    value={aiKeyword}
                    onChange={(e) => setAiKeyword(e.target.value)}
                    className="w-full border px-3 py-2 rounded"
                  />
                  <input
                    type="text"
                    placeholder="イチオシは？（例: チョコバナナ）"
                    value={aiFeature}
                    onChange={(e) => setAiFeature(e.target.value)}
                    className="w-full border px-3 py-2 rounded"
                  />

                  <div className="space-y-2">
                    <Button
                      className="bg-indigo-600 w-full disabled:opacity-50"
                      disabled={!aiKeyword || !aiFeature || aiLoading}
                      onClick={async () => {
                        setAiLoading(true);
                        try {
                          const res = await fetch(
                            "/api/generate-store-description",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name,
                                address,
                                keyword: aiKeyword,
                                feature: aiFeature,
                              }),
                            }
                          );
                          const data = await res.json();
                          if (data.description) {
                            setDescription((prev) =>
                              prev?.trim()
                                ? `${prev}\n\n${data.description}`
                                : data.description
                            );
                            setShowAIModal(false);
                            setAiKeyword("");
                            setAiFeature("");
                          } else {
                            alert("生成に失敗しました");
                          }
                        } catch (err) {
                          alert("エラーが発生しました");
                          console.error(err);
                        } finally {
                          setAiLoading(false);
                        }
                      }}
                    >
                      {aiLoading ? "生成中..." : "生成する"}
                    </Button>

                    <Button
                      className="bg-gray-300 w-full"
                      variant="outline"
                      onClick={() => {
                        setShowAIModal(false);
                        setAiKeyword("");
                        setAiFeature("");
                      }}
                    >
                      閉じる
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 言語ピッカー */}
            {showLangPicker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40"
                onClick={() => !translating && setShowLangPicker(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="w-full max-w-lg mx-4 rounded-2xl shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
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

                    <div className="px-5 pt-4">
                      <input
                        type="text"
                        value={langQuery}
                        onChange={(e) => setLangQuery(e.target.value)}
                        placeholder="言語名やコードで検索（例: フランス語 / fr）"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

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
                          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-400 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      ))}
                      {filteredLangs.length === 0 && (
                        <div className="col-span-full text-center text-sm text-gray-500 py-6">
                          一致する言語が見つかりません
                        </div>
                      )}
                    </div>

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

                    {translating && (
                      <div className="h-1 w-full overflow-hidden rounded-b-2xl">
                        <div className="h-full w-1/2 animate-[progress_1.2s_ease-in-out_infinite] bg-indigo-500" />
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* 画像選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                （任意）画像
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full h-10 bg-gray-400 text-white rounded-md file:text-white file:px-4 file:py-1 file:border-0 file:cursor-pointer"
                disabled={uploading}
              />
            </div>

            {/* 選択 or 既存のファイル名 */}
            {file ? (
              <p className="text-sm text-gray-600">
                選択中のファイル: {file.name}
              </p>
            ) : formMode === "edit" && editingStore?.originalFileName ? (
              <p className="text-sm text-gray-600">
                現在登録されているファイル: {editingStore.originalFileName}
              </p>
            ) : null}

            {/* 進捗 */}
            {uploading && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  アップロード中… {progress}%
                </p>
                <div className="w-full h-2 bg-gray-300 rounded">
                  <div
                    className="h-full bg-green-500 rounded transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-center gap-2">
              <Button
                onClick={saveStore}
                disabled={submitFlag}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                {submitFlag ? "保存中..." : "保存"}
              </Button>
              <button
                onClick={closeForm}
                disabled={submitFlag}
                className="px-4 py-2 bg-gray-500 text-white rounded"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ===== Sortable item ===== */
function SortableStoreItem({
  store,
  children,
}: {
  store: Store;
  children: (props: {
    attributes: any;
    listeners: any;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: store.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

interface StoreCardProps {
  store: Store;
  isAdmin: boolean;
  isDragging: boolean;
  isDark: boolean;
  gradient: string;
  listeners: any;
  attributes: any;
  onEdit: (store: Store) => void;
  onRemove: (store: Store) => void;
}

function StoreCard({
  store: s,
  isAdmin,
  isDragging,
  isDark,
  gradient,
  listeners,
  attributes,
  onEdit,
  onRemove,
}: StoreCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -150px 0px" });

  // ✅ 住所を行ごとに分割。最初の行だけリンク化
  const addrLines = (s.address ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const primaryAddr = addrLines[0] ?? "";

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={clsx(
        "rounded-lg shadow relative transition-colors overflow-visible mt-6",
        "bg-gradient-to-b",
        gradient,
        isDragging
          ? "bg-yellow-100"
          : isDark
          ? "bg-black/40 text-white"
          : "bg-white"
      )}
    >
      {/* ドラッグハンドル（上の真ん中） */}
      {auth.currentUser !== null && (
        <div
          {...attributes}
          {...listeners}
          onTouchStart={(e) => e.preventDefault()}
          className="absolute -top-5 left-1/2 -translate-x-1/2 z-30 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className="w-10 h-10 rounded-full bg-white/90 text-gray-800 flex items-center justify-center shadow-md ring-1 ring-black/10 backdrop-blur">
            <Pin className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* 画像 */}
      {s.imageURL && (
        <div className="relative w-full aspect-[1/1]">
          <Image
            src={s.imageURL}
            alt={s.name}
            fill
            className="object-cover rounded-t-lg"
            unoptimized
          />
        </div>
      )}

      {/* 本文 */}
      <div className={clsx("p-4 space-y-2", isDark && "text-white")}>
        <h2 className="text-xl font-semibold whitespace-pre-wrap">{s.name}</h2>

        {/* ✅ 原文の住所(1行目)だけリンク。以降はプレーンテキストで改行表示 */}
        <div className="text-sm">
          {primaryAddr && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                primaryAddr
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "underline",
                isDark
                  ? "text-blue-300 hover:text-blue-200"
                  : "text-blue-700 hover:text-blue-900"
              )}
            >
              {primaryAddr}
            </a>
          )}
          {addrLines.slice(1).map((ln, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {ln}
            </div>
          ))}
        </div>

        {s.description && (
          <p className="text-sm whitespace-pre-wrap">{s.description}</p>
        )}
      </div>

      {isAdmin && (
        <div className="absolute top-2 right-2 flex gap-2">
          <button
            className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            onClick={() => onEdit(s)}
          >
            編集
          </button>
          <button
            className="px-2 py-1 bg-red-600 text-white rounded text-sm"
            onClick={() => onRemove(s)}
          >
            削除
          </button>
        </div>
      )}
    </motion.div>
  );
}
