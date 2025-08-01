import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";

// Firebase 初期化（未初期化なら）
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};
if (!getApps().length) {
  initializeApp(firebaseConfig);
}
const db = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const { name, email, message, siteKey } = await req.json();

    // Firestoreからオーナーのメールアドレス取得
    const docRef = doc(db, "siteSettings", siteKey);
    const snapshot = await getDoc(docRef);
    const ownerEmail = snapshot.exists() ? snapshot.data().ownerEmail : null;

    if (!ownerEmail) {
      return NextResponse.json({ error: "オーナーのメールアドレスが見つかりません" }, { status: 400 });
    }

    // Gmail 認証設定
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const accessToken = await oAuth2Client.getAccessToken();

    // Nodemailer トランスポート作成
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.SENDER_EMAIL,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken.token!,
      },
    });

    // メール送信
    await transporter.sendMail({
      from: `Pageit 求人フォーム <${process.env.SENDER_EMAIL}>`,
      to: ownerEmail,
      subject: "【Pageit】求人フォームの応募が届きました",
      text: `お名前: ${name}\nメールアドレス: ${email}\n内容:\n${message}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("送信失敗:", error);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
