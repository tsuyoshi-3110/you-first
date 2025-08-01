"use client";
import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  increment,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Heart } from "lucide-react"; // ← ハートアイコン（Lucide使用）

export default function LikeButton({
  postId,
  likeCount,
}: {
  postId: string;
  likeCount: number;
}) {
  const uid = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "posts", postId, "likes", uid)).then((d) =>
      setLiked(d.exists())
    );
  }, [uid, postId]);

  const toggle = async () => {
    if (!uid) return;
    const postRef = doc(db, "posts", postId);
    const likeRef = doc(postRef, "likes", uid);

    try {
      if (liked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, {
          likeCount: increment(-1),
        });
        setLiked(false);
      } else {
        await setDoc(likeRef, {
          likedAt: serverTimestamp(),
        });
        await updateDoc(postRef, {
          likeCount: increment(1),
        });
        setLiked(true);
      }
    } catch (e) {
      console.error("いいね処理に失敗しました", e);
      alert("いいねできませんでした。もう一度お試しください。");
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1"
    >
      <Heart
        className={`w-5 h-5 transition-colors duration-300 ${
          liked ? "text-pink-600 fill-pink-600" : "text-gray-400"
        }`}
        fill={liked ? "currentColor" : "none"} // ← 塗りつぶし切り替え
      />
      <span className="text-sm">{likeCount}</span>
    </button>
  );
}
