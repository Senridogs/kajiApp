# kaji-app — 危険ゾーンガイド

> このファイルはkaji-app固有の「触ると壊れやすい箇所」をまとめたもの。
> 全体ルールはルートの `CLAUDE.md` を参照。

## Critical Files（変更時は要注意）

### Global Types & Configs（変更が全体に波及）

| ファイル | 役割 | 注意点 |
|---------|------|--------|
| `src/lib/types.ts` | 型定義（AppUser, ChoreWithComputed, BootstrapResponse等） | 多数のファイルが依存。変更時は全体的な影響確認必須 |
| `src/lib/prisma.ts` | Prismaクライアント（シングルトン） | グローバルキャッシュ。dev環境のHMR考慮あり |
| `next.config.ts` | Next.js設定 | devIndicators: false |
| `prisma/schema.prisma` | DBスキーマ定義 | 変更後は `prisma migrate dev` 必須 |
| `components.json` | shadcn/ui設定 | コンポーネント追加時に参照 |

### Core Logic（バグが直結）

| ファイル | 役割 | 注意点 |
|---------|------|--------|
| `src/lib/session.ts` | Cookie認証基盤 | getSession/setSession/clearSession。httpOnly Cookie |
| `src/lib/api.ts` | API共通処理 | requireSession, readJsonBody, badRequest |
| `src/lib/dashboard.ts` | 家事計算ロジック | computeChore, splitChoresForHome。期日判定の核 |
| `src/lib/chore-occurrence.ts` | ChoreOccurrence生成・管理 | 重複累積バグ修正済み（PR #55）。変更時は要注意 |
| `src/lib/occurrence-read-model.ts` | 予定読み取りモデル | occurrence-chore連携の複雑なロジック |
| `src/lib/home-occurrence.ts` | ホーム画面の発生・進捗 | pending/consumed状態の管理 |
| `src/lib/time.ts` | JST時刻ユーティリティ | DB=UTC、表示=JST。全APIで使用 |
| `src/lib/notifications.ts` | Web Push送信 | sendWebPush, buildReminderPayload |
| `src/lib/sync.ts` | 多端末同期 | touchHousehold()でポーリング同期 |
| `src/components/kaji/kaji-app.tsx` | メインSPA UI | 巨大コンポーネント。タブ管理・状態管理の中核 |

### Local State（データ消失リスク）

| ファイル | 役割 | 注意点 |
|---------|------|--------|
| `src/lib/theme-mode.ts` | テーマモード管理 | localStorage。light/dark切替 |
| `src/lib/theme-color.ts` | テーマカラー管理 | localStorage。4色（orange/blue/emerald/rose） |
| `src/lib/home-order.ts` | ホーム画面の並び順 | localStorage。ドラッグ&ドロップ並替 |

## ページ構造

| パス | 画面 | 備考 |
|------|------|------|
| `/` | メインSPA（KajiApp） | タブ: ホーム/一覧/統計/設定 |

> UIは実質SPA。`src/app/page.tsx` → `src/components/kaji/kaji-app.tsx` がすべてのタブ画面を管理。App RouterのルーティングはAPIのみ使用。

## フロントエンド固有の複雑性

### SPA状態管理
- `kaji-app.tsx`が巨大（全タブのstate + ロジック集約）。変更時は副作用に注意
- React hooks（useState, useTransition, useCallback）で状態管理。外部ライブラリなし

### モバイルUX
- スワイプ戻る（use-edge-swipe-back）、スワイプ削除（use-swipe-delete）、スワイプタブ切替（use-swipe-tab）
- Pull-to-refresh対応
- ドラッグ&ドロップ並び替え（ホーム画面）

### 多端末同期
- ポーリング方式。`/api/sync`でhousehold.updatedAtを比較
- 競合解決はサーバー側優先（last-write-wins）

### ChoreOccurrence（最も複雑）
- スケジュール発生の読み取りモデル。pending→consumed遷移
- 重複累積バグ修正済み（PR #55）だが、ロジック変更時は回帰テスト必須

## Progressive Context: 参照先一覧

| 情報 | 参照先 |
|------|--------|
| プロジェクト全体 | ルート `CLAUDE.md` |
| 教訓・課題 | `MEMORY.md` |
| コーディング規約 | `.claude/rules/coding-style.md` |
| Git運用 | `.claude/rules/git-workflow.md` |
| セキュリティ | `.claude/rules/security.md` |
| テスト方針 | `.claude/rules/testing.md` |
| オーケストレーション | `.claude/rules/orchestration.md` |
