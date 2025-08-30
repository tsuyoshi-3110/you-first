"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";

import { v4 as uuid } from "uuid";
import imageCompression from "browser-image-compression";

import { useThemeGradient } from "@/lib/useThemeGradient";
import { ThemeKey, THEMES } from "@/lib/themes";
import { type Product } from "@/types/Product";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import { motion } from "framer-motion";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";


type MediaType = "image" | "video";

export default function ProductDetail({ product }: { product: Product }) {
  /* ---------- 権限・テーマ ---------- */
  const [isAdmin, setIsAdmin] = useState(false);
  const gradient = useThemeGradient();
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAdmin(!!u));
    return () => unsub();
  }, []);

  const isDark = useMemo(() => {
    const darks: ThemeKey[] = ["brandG", "brandH", "brandI"];
    return gradient && darks.some((k) => gradient === THEMES[k]);
  }, [gradient]);

  /* ---------- 表示用データ ---------- */
  /** ← これを state にして、保存後すぐ setDisplayProduct で更新 */
  const [displayProduct, setDisplayProduct] = useState<Product>(product);

  /* ---------- 編集モーダル用 state ---------- */
  const [showEdit, setShowEdit] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [body, setBody] = useState(product.body);
  // const [price, setPrice] = useState<number | "">(product.price);
  // const [taxIncluded, setTaxIncluded] = useState(product.taxIncluded);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  /* ---------- ハンドラ ---------- */

  // 編集保存
  const handleSave = async () => {
    if (!title.trim()) return alert("タイトル必須");
    // if (price === "") return alert("価格を入力してください");

    try {
      let mediaURL = displayProduct.mediaURL;
      let mediaType: MediaType = displayProduct.mediaType;

      /* 画像 / 動画を差し替える場合のみアップロード */
      if (file) {
        const isVideo = file.type.startsWith("video/");
        mediaType = isVideo ? "video" : "image";

        const isValidImage =
          file.type === "image/jpeg" || file.type === "image/png";
        const isValidVideo =
          file.type === "video/mp4" || file.type === "video/quicktime";
        if (!isValidImage && !isValidVideo)
          return alert("対応形式：JPEG/PNG/MP4/MOV");

        if (isVideo && file.size > 100 * 1024 * 1024)
          return alert("動画は 100 MB 未満にしてください");

        /* 圧縮（画像のみ） */
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

        /* Storage へアップロード */
        const storageRef = ref(
          getStorage(),
          `products/public/${SITE_KEY}/${product.id}.${ext}`
        );
        const task = uploadBytesResumable(storageRef, uploadFile, {
          contentType: isVideo ? file.type : "image/jpeg",
        });

        setProgress(0);
        task.on("state_changed", (s) =>
          setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100))
        );
        await task;

        mediaURL = `${await getDownloadURL(storageRef)}?v=${uuid()}`;
        setProgress(null);
      }

      /* Firestore 更新 */
      await updateDoc(doc(db, "siteProducts", SITE_KEY, "items", product.id), {
        title,
        body,
        // price,
        // taxIncluded,
        mediaURL,
        mediaType,
        updatedAt: serverTimestamp(),
      });

      /* ★ ローカル表示も即更新 */
      setDisplayProduct((prev) => ({
        ...prev,
        title,
        body,
        // price: typeof price === "number" ? price : 0,
        // taxIncluded,
        mediaURL,
        mediaType,
      }));

      setShowEdit(false);
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました");
      setProgress(null);
    }
  };

  // 削除
 // 差し替え版 handleDelete
const handleDelete = async () => {
  if (!confirm(`「${displayProduct.title}」を削除しますか？`)) return;

  const storage = getStorage();

  // 1) Firestore ドキュメントを先に削除（UI から消える）
  await deleteDoc(doc(db, "siteProducts", SITE_KEY, "items", product.id)).catch(() => {});

  // 2) 元メディアを“実在するものだけ”削除
  try {
    // products/public/<SITE_KEY>/ 下を一覧して、<id>.xxx の実ファイルだけ消す
    const folderRef = ref(storage, `products/public/${SITE_KEY}`);
    const listing = await listAll(folderRef);
    const mine = listing.items.filter((i) => i.name.startsWith(`${product.id}.`));
    await Promise.all(mine.map((item) => deleteObject(item).catch(() => {})));
  } catch {
    /* 取得できなくても致命的ではないので握りつぶす */
  }

  // 3) HLS 配下（もしあれば）を再帰削除
  try {
    const walkAndDelete = async (dirRef: ReturnType<typeof ref>) => {
      const ls = await listAll(dirRef);
      await Promise.all(ls.items.map((i) => deleteObject(i).catch(() => {})));
      await Promise.all(ls.prefixes.map((p) => walkAndDelete(p)));
    };
    const hlsDirRef = ref(storage, `products/public/${SITE_KEY}/hls/${product.id}`);
    await walkAndDelete(hlsDirRef);
  } catch {
    /* HLS が無ければ何もしない */
  }

  // 4) 戻る
  router.back();
};

  /* ---------- JSX ---------- */
  return (
    <main className="min-h-screen flex items-start justify-center p-4 pt-24">
      {/* カード外枠 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3 }}
        className={clsx(
          "border rounded-lg overflow-hidden shadow-xl relative transition-colors duration-200",
          "w-full max-w-md",
          "bg-gradient-to-b",
          "mt-5",
          gradient,
          isDark ? "bg-black/40 text-white" : "bg-white"
        )}
      >
        {/* 編集・削除 */}
        {isAdmin && (
          <div className="absolute top-2 right-2 z-20 flex gap-1">
            <button
              onClick={() => setShowEdit(true)}
              className="px-2 py-1 bg-blue-600 text-white text-md rounded shadow disabled:opacity-50"
            >
              編集
            </button>
            <button
              onClick={handleDelete}
              className="px-2 py-1 bg-red-600 text-white text-md rounded shadow disabled:opacity-50"
            >
              削除
            </button>
          </div>
        )}

        {/* メディア */}
        {displayProduct.mediaType === "image" ? (
          <div className="relative w-full aspect-square">
            <Image
              src={displayProduct.mediaURL}
              alt={displayProduct.title}
              fill
              className="object-cover"
              sizes="100vw"
              unoptimized 
            />
          </div>
        ) : (
          <video
            src={displayProduct.mediaURL}
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
            className="w-full aspect-square object-cover"
          />
        )}

        {/* テキスト */}
        <div className="p-4 space-y-2">
          <h1 className={clsx("text-lg font-bold", isDark && "text-white")}>
            {displayProduct.title}
          </h1>
          {/* <p className={clsx("font-semibold", isDark && "text-white")}>
            ¥{displayProduct.price.toLocaleString()}（
            {displayProduct.taxIncluded ? "税込" : "税抜"}）
          </p> */}
          {displayProduct.body && (
            <p
              className={clsx(
                "text-sm whitespace-pre-wrap leading-relaxed",
                isDark && "text-white"
              )}
            >
              {displayProduct.body}
            </p>
          )}
        </div>
      </motion.div>

      {/* ---------- 編集モーダル ---------- */}
      {isAdmin && showEdit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">商品を編集</h2>

            <input
              type="text"
              placeholder="商品名"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />
            {/* <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="価格 (円)"
              value={price}
              onChange={(e) =>
                setPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            /> */}

            {/* <div className="flex gap-4">
              <label>
                <input
                  type="radio"
                  checked={taxIncluded}
                  onChange={() => setTaxIncluded(true)}
                />
                税込
              </label>
              <label>
                <input
                  type="radio"
                  checked={!taxIncluded}
                  onChange={() => setTaxIncluded(false)}
                />
                税抜
              </label> */}
            {/* </div> */}

            <textarea
              placeholder="紹介文"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              rows={4}
              disabled={uploading}
            />

            <input
              type="file"
              accept="image/*,video/mp4,video/quicktime"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="bg-gray-500 text-white w-full h-10 px-3 py-1 rounded"
              disabled={uploading}
            />

            {uploading && (
              <div className="w-full flex flex-col items-center gap-2">
                <p>アップロード中… {progress}%</p>
                <div className="w-full h-2 bg-gray-200 rounded">
                  <div
                    className="h-full bg-green-500 rounded transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={handleSave}
                disabled={uploading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                更新
              </button>
              <button
                onClick={() => !uploading && setShowEdit(false)}
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
