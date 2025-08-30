"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import MenuItemCard from "./MenuItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  ref,
  UploadTask,
} from "firebase/storage";

import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import ProductMedia from "@/components/ProductMedia";

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: number | null;
  isTaxIncluded?: boolean;
  order: number;
};

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

export default function MenuSectionCard({
  section,
  onTitleUpdate,
  isLoggedIn,
  onDeleteSection,
}: {
  section: Section;
  onTitleUpdate: (newTitle: string) => void;
  isLoggedIn: boolean;
  onDeleteSection: () => void;
  onSectionPatch?: (patch: Partial<Section>) => void;
}) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showEditSectionModal, setShowEditSectionModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState(section.title);

  // 新規追加用
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [isTaxIncluded, setIsTaxIncluded] = useState(true);

  // アイテム編集用
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editIsTaxIncluded, setEditIsTaxIncluded] = useState(true);

  // メディア操作用
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 進捗モーダル用
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const uploadTaskRef = useRef<UploadTask | null>(null);

  // セクション変更時にタイトル初期化
  useEffect(() => {
    setNewTitle(section.title || "");
  }, [section.id, section.title]);

  // 一覧取得
  useEffect(() => {
    const fetchItems = async () => {
      const q = query(
        collection(db, `menuSections/${section.id}/items`),
        orderBy("order", "asc")
      );
      const snap = await getDocs(q);
      setItems(
        snap.docs.map((d) => {
          const data = d.data() as Omit<MenuItem, "id">;
          return { id: d.id, ...data };
        })
      );
    };
    fetchItems();
  }, [section.id]);

  // セクション削除
  const handleDeleteSection = async () => {
    if (!confirm("このセクションを削除しますか？")) return;

    try {
      if (section.mediaUrl) {
        const sref = ref(getStorage(), section.mediaUrl);
        await deleteObject(sref);
      }
    } catch {
      // ストレージ削除失敗は握りつぶし
    }

    await deleteDoc(doc(db, "menuSections", section.id));
    onDeleteSection();
  };

  // セクション名更新
  const handleUpdateSectionTitle = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      alert("セクション名を入力してください");
      return;
    }
    await updateDoc(doc(db, "menuSections", section.id), { title: trimmed });
    onTitleUpdate(trimmed);
    setShowEditSectionModal(false);
  };

  // 追加
  const handleAddItem = async () => {
    if (!newName.trim()) {
      alert("名前は必須です");
      return;
    }
    const order = items.length;
    const priceNum =
      newPrice.trim() === ""
        ? null
        : Number.isNaN(Number(newPrice))
        ? null
        : Number(newPrice);

    const refDoc = await addDoc(
      collection(db, `menuSections/${section.id}/items`),
      {
        name: newName.trim(),
        description: newDescription.trim(),
        price: priceNum,
        isTaxIncluded,
        order,
      }
    );

    setItems((prev) => [
      ...prev,
      {
        id: refDoc.id,
        name: newName.trim(),
        description: newDescription.trim(),
        price: priceNum,
        isTaxIncluded,
        order,
      },
    ]);

    setShowAddModal(false);
    setNewName("");
    setNewDescription("");
    setNewPrice("");
    setIsTaxIncluded(true);
  };

  // 個別削除
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("このメニューを削除しますか？")) return;
    await deleteDoc(doc(db, `menuSections/${section.id}/items`, itemId));
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  // 編集開始（右スワイプ発火）
  const openEditItem = (it: MenuItem) => setEditing(it);

  useEffect(() => {
    if (editing) {
      setEditName(editing.name || "");
      setEditDescription(editing.description || "");
      setEditPrice(
        editing.price === undefined || editing.price === null
          ? ""
          : String(editing.price)
      );
      setEditIsTaxIncluded(editing.isTaxIncluded ?? true);
    }
  }, [editing]);

  // ===== メディア関連 =====

  const pickMedia = () => fileInputRef.current?.click();

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("画像または動画を選択してください。");
      return;
    }

    // ---- 30秒制限 & メタ取得（幅/高さ/向き）----
    let durationSec: number | null = null;
    let mediaWidth: number | null = null;
    let mediaHeight: number | null = null;
    let orientation: "portrait" | "landscape" = "landscape";

    try {
      if (isVideo) {
        const meta = await getVideoMetaFromFile(file); // duration / width / height
        if (meta.duration > 61) {
          alert(
            `動画は60秒以内にしてください。（選択: 約${Math.round(
              meta.duration
            )}秒）`
          );
          return;
        }
        durationSec = Math.round(meta.duration);
        mediaWidth = meta.width;
        mediaHeight = meta.height;
        orientation = meta.height > meta.width ? "portrait" : "landscape";
      } else {
        const size = await getImageSize(file); // width / height
        mediaWidth = size.width;
        mediaHeight = size.height;
        orientation = size.height > size.width ? "portrait" : "landscape";
      }
    } catch {
      alert("メディア情報の取得に失敗しました。別のファイルでお試しください。");
      return;
    }

    try {
      setUploading(true);

      const ext = getExt(file.name) || (isImage ? "jpg" : "mp4");
      const path = `sections/${SITE_KEY}/${section.id}/header.${ext}`;
      const sref = storageRef(getStorage(), path);

      // ▼ 進捗モーダル ON
      setUploadPercent(0);
      setUploadOpen(true);

      const task = uploadBytesResumable(sref, file, { contentType: file.type });
      uploadTaskRef.current = task;

      // アップロード完了まで待つ（進捗反映＆キャンセル対応）
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

      const payload: Partial<Section> = {
        mediaType: isImage ? "image" : "video",
        mediaUrl: url,
        durationSec,
        orientation,
        mediaWidth,
        mediaHeight,
      };

      await updateDoc(doc(db, "menuSections", section.id), payload);

      // ローカル反映
      Object.assign(section, payload);
      setShowEditSectionModal(false);
    } catch (err: any) {
      if (err?.code === "storage/canceled") {
        console.info("upload canceled");
      } else {
        console.error(err);
        alert("アップロードに失敗しました。");
      }
    } finally {
      setUploading(false);
      setUploadOpen(false);
      uploadTaskRef.current = null;
    }
  };

  // キャンセルボタン押下時
  const cancelUpload = () => {
    try {
      uploadTaskRef.current?.cancel(); // 途中で中止
    } finally {
      setUploadOpen(false);
      setUploading(false);
    }
  };

  function UploadProgressModal({
    open,
    percent,
    onCancel,
    title = "アップロード中…",
  }: {
    open: boolean;
    percent: number;
    onCancel: () => void;
    title?: string;
  }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">
        <div className="w-[90%] max-w-sm rounded-lg bg-white p-5 shadow-xl ">
          <h2 className="mb-3 text-lg font-semibold">{title}</h2>
          <div className="mb-2 text-sm text-gray-600">
            {Math.floor(percent)}%
          </div>
          <div className="h-2 w-full rounded bg-gray-200">
            <div
              className="h-2 rounded bg-blue-500 transition-[width]"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <div className="mt-4 flex justify-end">
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

  const removeMedia = async () => {
    if (!section.mediaUrl) return;
    if (!confirm("添付メディアを削除しますか？")) return;

    try {
      try {
        const sref = ref(getStorage(), section.mediaUrl);
        await deleteObject(sref);
      } catch {}
      await updateDoc(doc(db, "menuSections", section.id), {
        mediaType: null,
        mediaUrl: null,
        durationSec: null,
        orientation: null,
        mediaWidth: null,
        mediaHeight: null,
      });
      section.mediaType = null;
      section.mediaUrl = null;
      section.durationSec = null;
      section.orientation = null;
      section.mediaWidth = null;
      section.mediaHeight = null;
      // 再描画トリガ
      setNewTitle((t) => t);
      setShowEditSectionModal(false);
    } catch (e) {
      console.error(e);
      alert("メディア削除に失敗しました。");
      setShowEditSectionModal(false);
    }
  };



 const mediaNode = useMemo(() => {
  if (!section.mediaUrl || !section.mediaType) return null;

  return (
    <ProductMedia
      src={section.mediaUrl}
      type={section.mediaType} // "image" | "video"
      className="mb-3 rounded-lg shadow-sm" // 見た目はお好みで
      alt={`${section.title} のメディア`}
      // autoPlay / loop / muted はデフォルト true（動画時）
    />
  );
}, [section.mediaUrl, section.mediaType, section.title]);

  return (
    <>
      <div className="bg-white/30 backdrop-blur-sm shadow-md p-4 rounded mb-6">
        {isLoggedIn && (
          <div className="flex gap-2 flex-wrap mt-6 mb-6">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEditSectionModal(true)}
            >
              ✎ セクション名/メディア
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSection}
            >
              セクション削除
            </Button>
          </div>
        )}

        <h2 className="text-xl font-semibold mb-4">{section.title}</h2>
        {mediaNode}

        <div className="flex-col justify-between items-center mb-2"></div>

        {items.map((item) => (
          <MenuItemCard
            key={item.id}
            item={item}
            isLoggedIn={isLoggedIn}
            onDelete={() => handleDeleteItem(item.id)}
            onEdit={openEditItem}
          />
        ))}

        {isLoggedIn && (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setShowAddModal(true)}
          >
            ＋ メニュー追加
          </Button>
        )}
      </div>

      {/* セクション名編集＋メディア添付モーダル */}
      {showEditSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">セクションを編集</h2>

            <label className="text-sm font-medium">セクション名</label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="mb-4 mt-1"
            />

            <div className="mb-3">
              <div className="text-sm font-medium mb-1">メディア（任意）</div>
              {section.mediaUrl ? (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">
                    現在: {section.mediaType === "image" ? "画像" : "動画"}
                    {section.durationSec
                      ? `（約${Math.round(section.durationSec)}秒）`
                      : ""}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={pickMedia}
                      disabled={uploading}
                    >
                      置き換え
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={removeMedia}
                      disabled={uploading}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pickMedia}
                  disabled={uploading}
                >
                  {uploading
                    ? "アップロード中…"
                    : "画像/動画を選択（動画は30秒まで）"}
                </Button>
              )}
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
                onClick={() => setShowEditSectionModal(false)}
              >
                閉じる
              </Button>
              <Button onClick={handleUpdateSectionTitle} disabled={uploading}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* メニュー追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">メニューを追加</h2>
            <Input
              placeholder="名前 (サービス名や商品名）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mb-2"
            />
            <textarea
              placeholder="説明（任意）"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={4}
              className="w-full border px-3 py-2 rounded mb-2"
            />
            <Input
              placeholder="価格（例：5500）(任意)"
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="mb-2"
            />
            <div className="flex gap-4 mb-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="add-tax"
                  checked={isTaxIncluded}
                  onChange={() => setIsTaxIncluded(true)}
                />
                税込
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="add-tax"
                  checked={!isTaxIncluded}
                  onChange={() => setIsTaxIncluded(false)}
                />
                税別
              </label>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                キャンセル
              </Button>
              <Button onClick={handleAddItem}>追加</Button>
            </div>
          </div>
        </div>
      )}

      {/* メニュー編集モーダル（右スワイプで開く） */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">メニューを編集</h2>
            <Input
              placeholder="名前"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mb-2"
            />
            <textarea
              placeholder="説明（任意）"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={4}
              className="w-full border px-3 py-2 rounded mb-2"
            />
            <Input
              placeholder="価格（任意）"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="mb-2"
            />
            <div className="flex gap-4 mb-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="edit-tax"
                  checked={editIsTaxIncluded}
                  onChange={() => setEditIsTaxIncluded(true)}
                />
                税込
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="edit-tax"
                  checked={!editIsTaxIncluded}
                  onChange={() => setEditIsTaxIncluded(false)}
                />
                税別
              </label>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setEditing(null)}>
                キャンセル
              </Button>
              <Button
                onClick={async () => {
                  if (!editing) return;
                  if (!editName.trim()) {
                    alert("名前は必須です");
                    return;
                  }
                  const priceNum =
                    editPrice.trim() === ""
                      ? null
                      : Number.isNaN(Number(editPrice))
                      ? null
                      : Number(editPrice);

                  await updateDoc(
                    doc(db, `menuSections/${section.id}/items`, editing.id),
                    {
                      name: editName.trim(),
                      description: editDescription.trim(),
                      price: priceNum,
                      isTaxIncluded: editIsTaxIncluded,
                    }
                  );

                  setItems((prev) =>
                    prev.map((it) =>
                      it.id === editing.id
                        ? {
                            ...it,
                            name: editName.trim(),
                            description: editDescription.trim(),
                            price: priceNum,
                            isTaxIncluded: editIsTaxIncluded,
                          }
                        : it
                    )
                  );

                  setEditing(null);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      <UploadProgressModal
        open={uploadOpen}
        percent={uploadPercent}
        onCancel={cancelUpload}
        title="メディアをアップロード中…"
      />
    </>
  );
}

/* ===== helpers ===== */
function getExt(name: string) {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

export function getVideoMetaFromFile(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      const meta = {
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      };
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      v.load();
      resolve(meta);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("動画メタデータの取得に失敗しました"));
    };
  });
}

function getImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
