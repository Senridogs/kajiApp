# Kaji App

夫婦向けの家事済・リマインドPWAです。  
Next.js + Prisma + Web Push で実装しています。

## 実装済み機能
- ユーザー登録（名前 + 招待コード参加）
- 家事の追加 / 編集 / 削除
- 家事実施の済（メモ付き）
- 当日済の取消
- 実施履歴一覧
- Home: 今日 / 明日 / 大仕事（1週間先まで）
- 統計: 家事別実施回数・ユーザー別実施回数・分担バランス
- 通知設定: 有効/無効、通知時刻、期限超過時の毎日通知
- Web Push（完了通知 + リマインド通知）
- PWA対応（インストール可能）
- Vercel Cron対応（`/api/cron/reminders`）

## UI
- Magic UI コンポーネント採用:
  - `Dock`
  - `BlurFade`
  - `AnimatedList`
  - `ShineBorder`

## 技術スタック
- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Prisma ORM + PostgreSQL
- Web Push (`web-push`)
- Vercel Cron

## セットアップ
1. 依存インストール
```bash
npm install
```

2. 環境変数
`.env.example` を `.env.local` にコピーし、値を設定してください。

```bash
cp .env.example .env.local
```

必要な値:
- `DATABASE_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `CRON_SECRET`

3. Prisma クライアント生成 / DB反映
```bash
npm run prisma:generate
npm run prisma:push
```

4. 開発起動
```bash
npm run dev
```

## VAPIDキー生成
```bash
npx web-push generate-vapid-keys
```

出力された `publicKey` / `privateKey` を `.env.local` に設定してください。

## Vercelデプロイ
1. 環境変数を Vercel Project に登録
2. `vercel.json` の cron を有効化
3. `CRON_SECRET` を設定

`/api/cron/reminders` は `Authorization: Bearer <CRON_SECRET>` か `?secret=<CRON_SECRET>` で実行できます。

## 補足
- iOS/Android のWeb Pushはブラウザ仕様に依存します。端末側で通知許可が必要です。
- 本アプリは夫婦利用想定のため、招待コード方式で同一世帯に参加する設計です。

