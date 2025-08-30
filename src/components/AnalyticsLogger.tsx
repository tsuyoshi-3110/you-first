"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  logPageView,
  logStayTime,
  logHourlyAccess,
  logDailyAccess,
  logReferrer,
  logWeekdayAccess,
  logVisitorType,
  logBounce,
  logGeo,
  // 直帰率の分母（views）を正しく記録
  logLandingView,
} from "@/lib/logAnalytics";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

/** 期間集計対応版ロガー
 * - *_Daily と day / accessedAt を logAnalytics 側で保持する前提
 * - 直帰率: セッション開始時に views を +1（logLandingView）
 *           離脱時に 1 ページのみなら bounces を +1（logBounce）
 */

const STAY_MAX_SEC = 60; // 異常値ガード（滞在時間の上限・秒）

export default function AnalyticsLogger() {
  const pathname = usePathname() || "/";
  const startTsRef = useRef<number>(Date.now());   // ページ入室時刻
  const prevPathRef = useRef<string>(pathname);    // 直前パス
  const pageCountRef = useRef<number>(0);          // セッション内ページ数

  /* 1) セッション一度だけ：地域（geoDaily に積む） */
  useEffect(() => {
    if (sessionStorage.getItem("geoLogged")) return;
    sessionStorage.setItem("geoLogged", "1");

    fetch("https://ipapi.co/json")
      .then((res) => res.json())
      .then((data) => {
        const region = data?.region || data?.country_name || "Unknown";
        logGeo(SITE_KEY, region);
      })
      .catch((e) => console.error("地域取得失敗:", e));
  }, []);

  /* 2) セッション一度だけ：リファラー（referrersDaily に積む） */
  useEffect(() => {
    if (sessionStorage.getItem("refLogged")) return;
    logReferrer(SITE_KEY);
    sessionStorage.setItem("refLogged", "1");
  }, []);

  /* 3) セッション内：ランディング views と バウンス */
  useEffect(() => {
    pageCountRef.current++;

    // 初回ページ＝ランディング → views を +1
    if (pageCountRef.current === 1) {
      const firstPageId = pathname === "/" ? "home" : pathname.slice(1);
      logLandingView(SITE_KEY, firstPageId);
    }

    // 離脱時、1ページのみ閲覧ならバウンス
    const handleBounce = () => {
      if (pageCountRef.current === 1) {
        const pageId = pathname === "/" ? "home" : pathname.slice(1);
        logBounce(SITE_KEY, pageId); // bounces のみ +1（views は加算しない）
      }
    };

    window.addEventListener("beforeunload", handleBounce);
    window.addEventListener("pagehide", handleBounce);
    return () => {
      window.removeEventListener("beforeunload", handleBounce);
      window.removeEventListener("pagehide", handleBounce);
    };
  }, [pathname]);

  /* 4) ルート変更：直前滞在時間を反映し、各種ログを積む */
  useEffect(() => {
    const prev = prevPathRef.current;
    const now = Date.now();

    const prevClean = prev && prev !== "/" ? prev.slice(1) : "home";
    const currClean = pathname && pathname !== "/" ? pathname.slice(1) : "home";

    // 直前ページの滞在時間（異常値は無視）
    const sec = Math.floor((now - startTsRef.current) / 1000);
    if (sec > 0 && sec <= STAY_MAX_SEC) {
      logStayTime(SITE_KEY, sec, prevClean);
    }

    // 現在ページのログ（全て期間集計対応の書き込み先を持つ）
    logPageView(pathname, SITE_KEY);      // pages / pagesDaily
    logHourlyAccess(SITE_KEY, currClean); // hourlyLogs (accessedAt/hour)
    logDailyAccess(SITE_KEY);             // dailyLogs (day)
    logWeekdayAccess(SITE_KEY);           // weekdayDaily
    logVisitorType(SITE_KEY);             // visitorDaily

    // 次のページ準備
    prevPathRef.current = pathname;
    startTsRef.current = now;
  }, [pathname]);

  /* 5) タブクローズ/遷移直前：最終滞在時間フラッシュ */
  useEffect(() => {
    const handleLeave = () => {
      const clean = pathname && pathname !== "/" ? pathname.slice(1) : "home";
      const sec = Math.floor((Date.now() - startTsRef.current) / 1000);
      if (sec > 0 && sec <= STAY_MAX_SEC) {
        logStayTime(SITE_KEY, sec, clean);
      }
    };

    window.addEventListener("beforeunload", handleLeave);
    window.addEventListener("pagehide", handleLeave);
    return () => {
      window.removeEventListener("beforeunload", handleLeave);
      window.removeEventListener("pagehide", handleLeave);
    };
  }, [pathname]);

  return null;
}
