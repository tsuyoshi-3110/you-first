// components/WallpaperBackground.tsx
"use client";

import { useWallpaperUrl } from "@/hooks/useWallpaper";

export default function WallpaperBackground() {
  const url = useWallpaperUrl();

  if (!url || url.trim() === "") {
    return null; // URLが存在しない場合は表示しない
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-screen h-screen -z-20 bg-cover bg-center"
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}
