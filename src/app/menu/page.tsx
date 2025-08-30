"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import MenuSectionCard from "@/components/MenuSectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onAuthStateChanged } from "firebase/auth";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from "firebase/storage";
import Image from "next/image";

// DnD
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

import { getExt, getVideoMetaFromFile, getImageSize } from "@/lib/media";

/* =========================
   型
========================= */
type Section = {
  id: string;
  title: string;
  order: number;
  siteKey: string;
  mediaType?: "image" | "video" | null;
  mediaUrl?: string | null;
  durationSec?: number | null;
  orientation?: "portrait" | "landscape" | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
};

type SortableChildArgs = {
  attributes: DraggableAttributes;
  listeners: ReturnType<typeof useSortable>["listeners"] | undefined;
  isDragging: boolean;
};

type Props = {
  id: string;
  children: (args: SortableChildArgs) => React.ReactNode;
};

/* =========================
   並び替え用アイテム（このファイル内に実装）
========================= */
function SortableSectionItem({ id, children }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

/* =========================
   本体
========================= */
export default function MenuPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 追加モーダル用: メディア選択
  const [newMediaFile, setNewMediaFile] = useState<File | null>(null);
  const [newMediaObjectUrl, setNewMediaObjectUrl] = useState<string | null>(
    null
  );
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 進捗モーダル
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadTaskRef = useRef<UploadTask | null>(null);

  const [showHelp, setShowHelp] = useState(false);

  // DnD センサー（クリック5px移動 or 長押しで開始）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  /* 認証フラグ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsLoggedIn(!!user));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setShowHelp(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  /* セクション購読（order 昇順） */
  useEffect(() => {
    const q = query(
      collection(db, "menuSections"),
      where("siteKey", "==", SITE_KEY),
      orderBy("order", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Section, "id">),
      }));
      setSections(rows);
    });
    return () => unsub();
  }, []);

  /* 追加モーダル：ファイル選択 */
  const pickMedia = () => fileInputRef.current?.click();

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      alert("画像または動画ファイルを選択してください。");
      return;
    }

    // ▼ 30秒制限（±1秒の誤差許容）
    if (isVideo) {
      try {
        const { duration } = await getVideoMetaFromFile(file);
        if (duration > 31) {
          alert(
            `動画は30秒以内にしてください。（選択：約${Math.round(
              duration
            )}秒）`
          );
          return;
        }
      } catch {
        alert(
          "動画の長さを取得できませんでした。別のファイルをお試しください。"
        );
        return;
      }
    }

    if (newMediaObjectUrl) URL.revokeObjectURL(newMediaObjectUrl);
    setNewMediaFile(file);
    setNewMediaObjectUrl(URL.createObjectURL(file));
  };

  const cancelUpload = () => {
    try {
      uploadTaskRef.current?.cancel();
    } finally {
      setUploadOpen(false);
    }
  };

  /* セクション追加（ストレージにアップロード→URL保存） */
  const handleAddSection = async () => {
    if (!newTitle.trim()) {
      alert("セクション名を入力してください");
      return;
    }

    try {
      setCreating(true);
      const newOrder = sections.length;

      // 1) 先にセクション作成（メディアは空で作る）
      const refDoc = await addDoc(collection(db, "menuSections"), {
        title: newTitle.trim(),
        order: newOrder,
        siteKey: SITE_KEY,
        mediaType: null,
        mediaUrl: null,
        durationSec: null,
        orientation: null,
        mediaWidth: null,
        mediaHeight: null,
      });

      // 2) メディアが選択されていればアップロード
      if (newMediaFile) {
        const isImage = newMediaFile.type.startsWith("image/");
        const isVideo = newMediaFile.type.startsWith("video/");
        if (!isImage && !isVideo) {
          alert("画像または動画ファイルを選択してください。");
          return;
        }

        let durationSec: number | null = null;
        let mediaWidth: number | null = null;
        let mediaHeight: number | null = null;
        let orientation: "portrait" | "landscape" = "landscape";

        if (isVideo) {
          const { duration, width, height } = await getVideoMetaFromFile(
            newMediaFile
          );
          if (duration > 31) {
            alert(
              `動画は30秒以内にしてください。（選択: 約${Math.round(
                duration
              )}秒）`
            );
            return;
          }
          durationSec = Math.round(duration);
          mediaWidth = width;
          mediaHeight = height;
          orientation = height > width ? "portrait" : "landscape";
        } else {
          const { width, height } = await getImageSize(newMediaFile);
          mediaWidth = width;
          mediaHeight = height;
          orientation = height > width ? "portrait" : "landscape";
        }

        const ext = getExt(newMediaFile.name) || (isImage ? "jpg" : "mp4");
        const path = `sections/${SITE_KEY}/${refDoc.id}/header.${ext}`;
        const sref = storageRef(getStorage(), path);

        // 進捗モーダルON
        setUploadPercent(0);
        setUploadOpen(true);

        const task = uploadBytesResumable(sref, newMediaFile, {
          contentType: newMediaFile.type,
        });
        uploadTaskRef.current = task;

        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
              setUploadPercent(pct);
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const url = await getDownloadURL(task.snapshot.ref);

        await updateDoc(doc(db, "menuSections", refDoc.id), {
          mediaType: isImage ? "image" : "video",
          mediaUrl: url,
          durationSec,
          orientation,
          mediaWidth,
          mediaHeight,
        });
      }

      // 3) 後始末（onSnapshot で自動反映される）
      setNewTitle("");
      setNewMediaFile(null);
      if (newMediaObjectUrl) {
        URL.revokeObjectURL(newMediaObjectUrl);
        setNewMediaObjectUrl(null);
      }
      setShowModal(false);
    } catch (e: any) {
      if (e?.code === "storage/canceled") {
        console.info("upload canceled");
      } else {
        console.error(e);
        alert("セクションの追加に失敗しました。");
      }
    } finally {
      setCreating(false);
      setUploadOpen(false);
      uploadTaskRef.current = null;
    }
  };

  /* 並び替え確定（ドラッグ終了） */
  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === String(active.id));
    const newIndex = sections.findIndex((s) => s.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const newList = arrayMove(sections, oldIndex, newIndex);

    // 楽観的更新（体感を速く）
    setSections(newList);

    // Firestore の order を一括更新
    const batch = writeBatch(db);
    newList.forEach((s, idx) => {
      batch.update(doc(db, "menuSections", s.id), { order: idx });
    });
    await batch.commit();
  };

  /* 追加モーダル内のプレビュー */
  const previewNode = useMemo(() => {
    if (!newMediaFile || !newMediaObjectUrl) return null;
    if (newMediaFile.type.startsWith("image/")) {
      return (
        <div className="relative w-full h-40 md:h-48 mb-2">
          <Image
            src={newMediaObjectUrl}
            alt="新規セクション画像プレビュー"
            fill
            className="object-cover rounded"
            sizes="100vw"
            unoptimized
          />
        </div>
      );
    }
    return (
      <video
        key={newMediaObjectUrl}
        src={newMediaObjectUrl}
        controls
        className="w-full rounded mb-2"
        preload="metadata"
      />
    );
  }, [newMediaFile, newMediaObjectUrl]);

  const wrapperClass = `p-4 max-w-2xl mx-auto pt-20 ${
    isLoggedIn ? "pb-20" : ""
  }`;

  return (
    <div className="relative">
      <div className={wrapperClass}>
        {isLoggedIn && (
          <Button className="mb-4" onClick={() => setShowModal(true)}>
            ＋ セクションを追加
          </Button>
        )}

        {/* 並び替えコンテナ */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => (
              <SortableSectionItem key={section.id} id={section.id}>
                {({ attributes, listeners, isDragging }) => (
                  <div className="relative">
                    {isLoggedIn && (
                      <div
                        {...attributes}
                        {...listeners}
                        className="absolute left-1/2 -translate-x-1/2 -top-4 z-10 cursor-grab active:cursor-grabbing touch-none select-none"
                        aria-label="ドラッグで並び替え"
                        onTouchStart={(e) => e.preventDefault()} // スクロール誤爆防止（必要なら）
                      >
                        <div className="w-10 h-10 bg-gray-200 text-gray-700 rounded-full text-sm flex items-center justify-center shadow">
                          ≡
                        </div>
                      </div>
                    )}

                    <div className={isDragging ? "opacity-70" : ""}>
                      <MenuSectionCard
                        section={section}
                        isLoggedIn={isLoggedIn}
                        onTitleUpdate={(t) => {
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id ? { ...s, title: t } : s
                            )
                          );
                        }}
                        onDeleteSection={() => {
                          setSections((prev) =>
                            prev.filter((s) => s.id !== section.id)
                          );
                        }}
                        // メディア変更などの即時反映
                        onSectionPatch={(patch) => {
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id ? { ...s, ...patch } : s
                            )
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
              </SortableSectionItem>
            ))}
          </SortableContext>
        </DndContext>

        {/* 追加モーダル（画像/動画選択対応・スクロール可） */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">新しいセクションを追加</h2>

              <label className="text-sm font-medium">セクション名</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例：ネイル、ヘアカット"
                className="mb-3 mt-1"
              />

              <div className="mb-3">
                <div className="text-sm font-medium mb-1">メディア（任意）</div>
                {previewNode}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={pickMedia}
                    disabled={creating}
                  >
                    画像/動画を選択（動画は30秒まで）
                  </Button>
                  {newMediaFile && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (newMediaObjectUrl)
                          URL.revokeObjectURL(newMediaObjectUrl);
                        setNewMediaFile(null);
                        setNewMediaObjectUrl(null);
                      }}
                      disabled={creating}
                    >
                      クリア
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={onPickFile}
                />
              </div>

              <div className="flex justify-between sticky bottom-0 bg-white pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  キャンセル
                </Button>
                <Button onClick={handleAddSection} disabled={creating}>
                  {creating ? "追加中…" : "追加"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 進捗モーダル（アップロード中のみ） */}
      <UploadProgressModal
        open={uploadOpen}
        percent={uploadPercent}
        onCancel={cancelUpload}
        title="メディアをアップロード中…"
      />

      {isLoggedIn && (
        <>
          {/* ？フローティングボタン */}
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="操作ヒントを表示"
            className="fixed top-15 right-5 z-50 w-12 h-12 rounded-full bg-blue-600 text-white text-2xl leading-none flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-95"
          >
            ?
          </button>

          {/* モーダル */}
          {showHelp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white w-[90%] max-w-md rounded-lg shadow-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold">操作ヒント</h3>
                  <button
                    onClick={() => setShowHelp(false)}
                    aria-label="閉じる"
                    className="ml-3 text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                {/* 説明文 */}
                <div className="space-y-3 text-sm text-blue-800">
                  <div>
                    <strong>1. 削除</strong>
                    行を<strong>左にスライド</strong>
                    すると削除ボタンが表示されます。 行を
                    <strong>右にスライド</strong>
                    すると編集ボタンが表示されます。
                  </div>

                  <div>
                    <strong>2. 並び替え</strong>
                    セクションや項目はドラッグ＆ドロップで順番を変更できます。
                  </div>
                  <div>
                    <strong>3. メディア編集</strong>
                    「✎
                    セクション名/メディア」ボタンから画像や動画を追加・変更できます。
                  </div>
                  <div>
                    <strong>4. 保存</strong>
                    編集後は自動保存されます。保存が完了すると緑色の通知が表示されます。
                  </div>
                </div>

                {/* 閉じるボタン */}
                <div className="mt-5 text-right">
                  <button
                    onClick={() => setShowHelp(false)}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* =========================
   進捗モーダル
========================= */
function UploadProgressModal({
  open,
  percent,
  onCancel,
  title = "アップロード中…",
}: {
  open: boolean;
  percent: number; // 0-100
  onCancel: () => void;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">
      <div className="w-[90%] max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        <div className="mb-2 text-sm text-gray-600">{Math.floor(percent)}%</div>
        <div className="h-2 w-full rounded bg-gray-200">
          <div
            className="h-2 rounded bg-blue-500 transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-red-500 px-3 py-1.5 text-white hover:bg-red-600"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   helpers
========================= */
