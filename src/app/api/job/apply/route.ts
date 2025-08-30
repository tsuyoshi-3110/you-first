// app/api/job/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

// ✅ Node ランタイム（Edge では nodemailer が動きません）
export const runtime = "nodejs";
// 予約/問い合わせはキャッシュしない
export const dynamic = "force-dynamic";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  SENDER_EMAIL, // ★ 追加：サーバー側で参照するサイトキー
} = process.env;

// OAuth Playground でリフレッシュトークンを発行している前提
const REDIRECT_URI = "https://developers.google.com/oauthplayground";

/* ----------------------------- utils ----------------------------- */

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string) => /^[0-9+\-() ]{8,}$/.test(v); // シンプル検証
const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHHmm = (v: string) => /^\d{2}:\d{2}$/.test(v);

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Firestore から ownerEmail を取得。
 *  1) siteSettings/{SITE_KEY_SERVER}
 *  2) 見つからなければ siteSettingsEditable/{SITE_KEY_SERVER}
 *  3) それでもダメなら null
 */
async function resolveOwnerEmail(): Promise<string | null> {
  if (!SITE_KEY) return null;

  // 1) siteSettings
  try {
    const ref1 = doc(db, "siteSettings", SITE_KEY);
    const snap1 = await getDoc(ref1);
    if (snap1.exists()) {
      const email = snap1.data()?.ownerEmail as string | undefined;
      if (email && isEmail(email)) return email;
    }
  } catch {}

  // 2) siteSettingsEditable
  try {
    const ref2 = doc(db, "siteSettingsEditable", SITE_KEY);
    const snap2 = await getDoc(ref2);
    if (snap2.exists()) {
      const email = snap2.data()?.ownerEmail as string | undefined;
      if (email && isEmail(email)) return email;
    }
  } catch {}

  // 3) 取得失敗
  return null;
}

/* ----------------------------- handler ----------------------------- */

export async function POST(req: NextRequest) {
  // 1) 入力の取り出し（siteKey は受け取らない設計）
  let payload: {
    // 新フォーム（推奨：予約/依頼）
    name?: string;
    email?: string;
    phone?: string;
    contactMethod?: "phone" | "email" | "line";
    date?: string; // YYYY-MM-DD
    time?: string; // HH:mm
    address?: string;
    notes?: string;

    // 旧フォーム互換（message のみ）
    message?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "JSON のパースに失敗しました" },
      { status: 400 }
    );
  }

  // 2) 正規化
  const name = (payload.name || "").trim();
  const email = (payload.email || "").trim();
  const phone = (payload.phone || "").trim();
  const contactMethod = (payload.contactMethod || "").trim() as
    | "phone"
    | "email"
    | "line"
    | "";
  const date = (payload.date || "").trim();
  const time = (payload.time || "").trim();
  const address = (payload.address || "").trim();
  const notes = (payload.notes || "").trim();
  const messageRaw = (payload.message || "").trim(); // 旧互換

  // 3) 必須チェック
  if (!name) {
    return NextResponse.json({ error: "お名前は必須です" }, { status: 400 });
  }
  if (!email || !isEmail(email)) {
    return NextResponse.json(
      { error: "メールアドレスが未入力か形式が不正です" },
      { status: 400 }
    );
  }

  // 新フォーム（予約/依頼）と旧フォーム（message）の切り分け
  const isNewForm = !!(date && time);
  if (isNewForm) {
    if (!phone || !isPhone(phone)) {
      return NextResponse.json(
        { error: "電話番号が未入力か形式が不正です" },
        { status: 400 }
      );
    }
    if (!isISODate(date)) {
      return NextResponse.json(
        { error: "ご希望日が不正です（YYYY-MM-DD）" },
        { status: 400 }
      );
    }
    if (!isHHmm(time)) {
      return NextResponse.json(
        { error: "ご希望時間が不正です（HH:mm）" },
        { status: 400 }
      );
    }
    if (!address) {
      return NextResponse.json({ error: "ご住所は必須です" }, { status: 400 });
    }
    if (!notes) {
      return NextResponse.json(
        { error: "ご要望・相談内容は必須です" },
        { status: 400 }
      );
    }
  } else {
    // 旧仕様：message 必須
    if (!messageRaw) {
      return NextResponse.json(
        { error: "メッセージが空です" },
        { status: 400 }
      );
    }
  }

  // 4) env チェック
  if (
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !GOOGLE_REFRESH_TOKEN ||
    !SENDER_EMAIL
  ) {
    return NextResponse.json(
      { error: "メール送信設定(env)が不足しています" },
      { status: 500 }
    );
  }

  try {
    // 5) 送信先 ownerEmail 解決（siteKey を受け取らずにサーバー側で判定）
    let ownerEmail = await resolveOwnerEmail();

    // 最後のフォールバック：ownerEmail がどうしても取れない場合は SENDER_EMAIL に送る
    if (!ownerEmail) {
      console.warn(
        "[job/apply] ownerEmail を Firestore から取得できませんでした。SENDER_EMAIL を宛先に使用します。"
      );
      ownerEmail = SENDER_EMAIL!;
    }

    // 6) OAuth2 アクセストークン
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    const accessTokenRes = await oAuth2Client.getAccessToken();
    const token =
      typeof accessTokenRes === "string"
        ? accessTokenRes
        : accessTokenRes?.token;

    if (!token) {
      console.error("アクセストークン取得失敗:", accessTokenRes);
      return NextResponse.json(
        { error: "アクセストークンの取得に失敗しました" },
        { status: 500 }
      );
    }

    // 7) Nodemailer
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: SENDER_EMAIL,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        refreshToken: GOOGLE_REFRESH_TOKEN,
        accessToken: token,
      },
    });

    // 8) メール本文の構築（新仕様優先、旧仕様フォールバック）
    const subjectNew = `【ご依頼】${name} 様よりお問い合わせ`;
    const subjectOld = `【ご依頼】${name} 様よりメッセージ`;

    const textNew = [
      "■ ご依頼内容が届きました",
      "",
      `■ お名前: ${name}`,
      `■ メール: ${email}`,
      `■ 電話: ${phone}`,
      `■ 連絡方法: ${contactMethod || "（未指定）"}`,
      `■ ご希望日時: ${date} ${time}`,
      `■ ご住所: ${address}`,
      "",
      "■ ご要望・相談内容:",
      notes,
      "",
      `※このメールに返信すると、お客様（${email}）へ返信できます。`,
    ].join("\n");

    const htmlNew = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial;line-height:1.7">
        <h2 style="margin:0 0 12px">ご依頼内容が届きました</h2>
        <table style="border-collapse:collapse">
          <tr><td style="padding:2px 8px 2px 0"><strong>お名前</strong></td><td>${escapeHtml(
            name
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>メール</strong></td><td>${escapeHtml(
            email
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>電話</strong></td><td>${escapeHtml(
            phone
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>連絡方法</strong></td><td>${escapeHtml(
            contactMethod || "（未指定）"
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>ご希望日時</strong></td><td>${escapeHtml(
            `${date} ${time}`
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>ご住所</strong></td><td>${escapeHtml(
            address
          )}</td></tr>
        </table>

        <h3 style="margin:16px 0 8px">ご要望・相談内容</h3>
        <pre style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:8px">${escapeHtml(
          notes
        )}</pre>

        <p style="margin-top:16px;color:#666">
          このメールに返信すると、お客様（${escapeHtml(email)}）へ返信できます。
        </p>
      </div>
    `;

    const textOld = [
      "■ ご依頼メッセージが届きました（旧フォーム）",
      "",
      `■ お名前: ${name}`,
      `■ メール: ${email}`,
      "",
      "■ メッセージ:",
      messageRaw,
      "",
      `※このメールに返信すると、お客様（${email}）へ返信できます。`,
    ].join("\n");

    const htmlOld = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial;line-height:1.7">
        <h2 style="margin:0 0 12px">ご依頼メッセージが届きました（旧フォーム）</h2>
        <table style="border-collapse:collapse">
          <tr><td style="padding:2px 8px 2px 0"><strong>お名前</strong></td><td>${escapeHtml(
            name
          )}</td></tr>
          <tr><td style="padding:2px 8px 2px 0"><strong>メール</strong></td><td>${escapeHtml(
            email
          )}</td></tr>
        </table>

        <h3 style="margin:16px 0 8px">メッセージ</h3>
        <pre style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:8px">${escapeHtml(
          messageRaw
        )}</pre>

        <p style="margin-top:16px;color:#666">
          このメールに返信すると、お客様（${escapeHtml(email)}）へ返信できます。
        </p>
      </div>
    `;

    const useNew = isNewForm;

    // 9) 送信
    await transport.sendMail({
      from: `ご依頼フォーム <${SENDER_EMAIL}>`,
      to: ownerEmail,
      replyTo: email, // 受信側がそのまま返信できる
      subject: useNew ? subjectNew : subjectOld,
      text: useNew ? textNew : textOld,
      html: useNew ? htmlNew : htmlOld,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("メール送信エラー:", error);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
