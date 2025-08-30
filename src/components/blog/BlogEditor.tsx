// components/blog/BlogEditor.tsx
"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { BlogBlock, BlogMedia } from "@/types/blog";
import { useRouter } from "next/navigation";
import {
  ref,
  deleteObject,
  getDownloadURL,
  uploadBytes,
} from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";
import clsx from "clsx";
import BlockEditor from "./BlockEditor";
import { v4 as uuid } from "uuid";

const DARK_KEYS: ThemeKey[] = ["brandH", "brandG", "brandI"];

type Props = { postId?: string };

/** Firestore に保存する前に undefined を除去 */
function pruneUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(pruneUndefined) as any;
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v as any);
    }
    return out;
  }
  return obj as any;
}

/** temp配下のメディアを posts/{postId}/ に移動しつつ進捗を報告 */
async function moveTempBlocksToPostIdWithProgress(
  postId: string,
  blocks: BlogBlock[],
  onProgress?: (info: { moved: number; total: number; pct: number; label: string }) => void
): Promise<BlogBlock[]> {
  const result: BlogBlock[] = [];
  const targets = blocks.filter(
    (b) =>
      (b.type === "image" || b.type === "video") &&
      typeof (b as any).path === "string" &&
      (b as any).path.includes("/posts/temp/")
  );
  const total = targets.length;

  let moved = 0;
  const emit = (label: string) => {
    const pct = total === 0 ? 100 : Math.min(100, Math.round(((moved) / total) * 100));
    onProgress?.({ moved, total, pct, label });
  };

  for (const b of blocks) {
    if (!(b.type === "image" || b.type === "video")) {
      result.push(b);
      continue;
    }
    const path = (b as any).path as string | undefined;
    if (!path || !path.includes("/posts/temp/")) {
      result.push(b);
      continue;
    }

    // 1件ずつ移動
    emit(`メディア移動中… ${moved + 1}/${total}`);
    const oldRef = ref(storage, path);
    const blob = await fetch(await getDownloadURL(oldRef)).then((r) => r.blob());
    const newPath = path.replace("/posts/temp/", `/posts/${postId}/`);
    const newRef = ref(storage, newPath);
    await uploadBytes(newRef, blob, { contentType: blob.type });
    const newUrl = await getDownloadURL(newRef);

    // 古いオブジェクトは削除（失敗は無視）
    try {
      await deleteObject(oldRef);
    } catch {}

    result.push({ ...(b as any), path: newPath, url: newUrl });
    moved++;
    emit(`メディア移動中… ${moved}/${total}`);
  }

  emit("最終処理中…");
  return result;
}

export default function BlogEditor({ postId }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<BlogBlock[]>([]);
  const [loading, setLoading] = useState(false);

  // === 進捗モーダル ===
  const [saveModal, setSaveModal] = useState<{
    open: boolean;
    pct: number;        // 0-100
    label: string;      // 「準備中…」「メディア移動中…」
    sub?: string;       // 追加説明
  }>({ open: false, pct: 0, label: "" });

  const openSaveModal = (label: string, pct = 0, sub?: string) =>
    setSaveModal({ open: true, pct, label, sub });
  const updateSaveModal = (patch: Partial<typeof saveModal>) =>
    setSaveModal((s) => ({ ...s, ...patch }));
  const closeSaveModal = () => setSaveModal({ open: false, pct: 0, label: "" });

  // === テーマ ===
  const gradient = useThemeGradient();
  const isDark =
    gradient &&
    DARK_KEYS.includes(
      Object.keys(THEMES).find(
        (k) => THEMES[k as ThemeKey] === gradient
      ) as ThemeKey
    );
  const textColorClass = isDark ? "text-white" : "text-black";

  // === 既存読み込み ===
  useEffect(() => {
    if (!postId) return;
    (async () => {
      const refDoc = doc(db, "siteBlogs", SITE_KEY, "posts", postId);
      const snap = await getDoc(refDoc);
      if (snap.exists()) {
        const d = snap.data() as any;
        setTitle(d.title ?? "");
        if (Array.isArray(d.blocks) && d.blocks.length) {
          setBlocks(d.blocks);
        } else {
          // 後方互換：body/media を blocks に詰め替え
          const tmp: BlogBlock[] = [];
          const bodyText = String(d.body || "");
          if (bodyText) tmp.push({ id: uuid(), type: "p", text: bodyText });
          const medias = Array.isArray(d.media) ? (d.media as BlogMedia[]) : [];
          for (const m of medias) tmp.push({ id: uuid(), ...(m as any) });
          if (tmp.length === 0) tmp.push({ id: uuid(), type: "p", text: "" });
          setBlocks(tmp);
        }
      }
    })();
  }, [postId]);

  // === 保存 ===
  const save = async () => {
    if (!title.trim()) {
      alert("タイトルを入力してください。");
      return;
    }
    setLoading(true);
    try {
      // フェーズ1：ドキュメント作成 or 更新準備
      openSaveModal("準備中…", 5);

      if (postId) {
        // 既存更新
        // フェーズ2：メディア移動（必要な分）
        let movedBlocks: BlogBlock[] = [];
        movedBlocks = await moveTempBlocksToPostIdWithProgress(
          postId,
          blocks,
          ({ pct, label }) => updateSaveModal({ pct: Math.max(10, Math.min(90, pct)), label })
        );

        // フェーズ3：本文生成と保存
        updateSaveModal({ label: "保存中…", pct: 95 });
        const plain = movedBlocks
          .filter((b) => b.type === "p")
          .map((b: any) => b.text || "")
          .join("\n\n")
          .trim();

        const refDoc = doc(db, "siteBlogs", SITE_KEY, "posts", postId);
        await updateDoc(refDoc, {
          title: title ?? "",
          body: plain,
          blocks: pruneUndefined(movedBlocks),
          updatedAt: serverTimestamp(),
        });

        updateSaveModal({ label: "完了", pct: 100 });
      } else {
        // 新規作成
        updateSaveModal({ label: "記事を作成中…", pct: 10 });
        const created = await addDoc(
          collection(db, "siteBlogs", SITE_KEY, "posts"),
          {
            title: title ?? "",
            body: "",
            blocks: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        // フェーズ2：メディア移動
        const moved = await moveTempBlocksToPostIdWithProgress(
          created.id,
          blocks,
          ({ pct, label }) =>
            updateSaveModal({ pct: 10 + Math.round((pct / 100) * 80), label })
        );

        // フェーズ3：本文生成と保存
        updateSaveModal({ label: "保存中…", pct: 95 });
        const plain = moved
          .filter((b) => b.type === "p")
          .map((b: any) => b.text || "")
          .join("\n\n")
          .trim();
        await updateDoc(created, {
          body: plain,
          blocks: pruneUndefined(moved),
          updatedAt: serverTimestamp(),
        });

        updateSaveModal({ label: "完了", pct: 100 });
      }

      // 少し見せてから遷移
      setTimeout(() => {
        closeSaveModal();
        router.push("/blog");
      }, 400);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "保存に失敗しました。");
      closeSaveModal();
    } finally {
      setLoading(false);
    }
  };

  // === 削除 ===
  const remove = async () => {
    if (!postId) return;
    if (!confirm("この記事を削除しますか？（メディアも削除されます）")) return;

    setLoading(true);
    openSaveModal("削除中…", 20);
    try {
      for (const b of blocks) {
        if ((b.type === "image" || b.type === "video") && (b as any).path) {
          try {
            await deleteObject(ref(storage, (b as any).path));
          } catch {}
        }
      }
      const refDoc = doc(db, "siteBlogs", SITE_KEY, "posts", postId);
      await deleteDoc(refDoc);
      updateSaveModal({ label: "完了", pct: 100 });

      setTimeout(() => {
        closeSaveModal();
        router.push("/blog");
      }, 300);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "削除に失敗しました。");
      closeSaveModal();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-6 ${textColorClass}`}>
      {/* タイトル */}
      <div className="grid gap-2">
        <label className="text-sm font-medium">タイトル</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル"
          className={textColorClass}
        />
      </div>

      {/* 本文（ブロック） */}
      <div className="grid gap-2">
        <label className="text-sm font-medium">本文（ブロック）</label>
        <BlockEditor value={blocks} onChange={setBlocks} postIdForPath={postId ?? null} />
      </div>

      {/* 操作ボタン */}
      <div className="flex gap-3">
        <Button onClick={save} disabled={loading}>
          {postId ? "更新" : "公開"}
        </Button>
        {postId && (
          <Button variant="destructive" onClick={remove} disabled={loading}>
            削除
          </Button>
        )}
      </div>

      {/* === 保存・削除 進捗モーダル === */}
      {saveModal.open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50">
          <div
            className={clsx(
              "w-[92%] max-w-md rounded-2xl p-5 shadow-xl",
              isDark ? "bg-gray-900 text-white" : "bg-white text-black"
            )}
          >
            <div className="mb-2 text-base font-semibold">{saveModal.label}</div>
            {saveModal.sub && (
              <div className={clsx("mb-2 text-xs", isDark ? "text-white/70" : "text-muted-foreground")}>
                {saveModal.sub}
              </div>
            )}

            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, saveModal.pct))}%` }}
              />
            </div>
            <div className={clsx("text-right text-xs tabular-nums", isDark ? "text-white/70" : "text-muted-foreground")}>
              {Math.max(0, Math.min(100, saveModal.pct))}%
            </div>

            <div className="mt-3 text-xs opacity-70">
              画面を閉じずにお待ちください…
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
