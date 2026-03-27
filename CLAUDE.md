# いえたすく — プロジェクトガイド

## 1. Purpose (The Why)

家庭の家事をみんなで分担・管理するアプリ

## 2. Repo Map & Progressive Context (The Map)

```
kajiApp/
├── kaji-app/                # メインアプリ
│   ├── CLAUDE.md               # 危険ゾーンガイド（Critical Files詳細はここ）
│   ├── src/
│   │   ├── app/                # ページ + APIルート
│   │   ├── components/         # UIコンポーネント
│   │   └── lib/                # ビジネスロジック・ユーティリティ
│   ├── prisma/                 # DBスキーマ・マイグレーション
│   ├── scripts/                # DB初期化・シード・SQLスクリプト
│   ├── test/                   # ユニット + 統合テスト
│   └── public/                 # PWA資産（manifest, SW, アイコン）
├── docs/                    # ドキュメント一式
│   ├── requirements/           # 要件定義（与件・実装ベース・エンハンス）
│   ├── design/                 # デザイン資産（.penファイル）
│   ├── screen-flow/            # 画面遷移図（drawio, mermaid）
│   ├── feedback/               # ユーザーフィードバック
│   ├── plans/                  # 実装計画・テスト計画
│   ├── db/                     # DB関連ドキュメント
│   └── memory/                 # 成功事例ログ（MEMORY.mdから退避した記録）
├── tools/                   # 変換スクリプト（drawio↔mermaid等）
├── .claude/                 # Rules・Skills・Scripts（自動読み込み対象）
│   ├── rules/                  # パス別詳細ルール
│   ├── skills/                 # カスタムスキル
│   └── scripts/                # フック用スクリプト
├── CLAUDE.md                # ← このファイル
└── MEMORY.md                # 教訓・課題・未探索領域
```

### Progressive Contextの読み込み順

1. **CLAUDE.md（本ファイル）** — 全体像・Tech Stack・ルール
2. **MEMORY.md** — 教訓・課題・未探索領域
3. **kaji-app/CLAUDE.md** — 危険ゾーン・フロントエンド固有事項
4. **.claude/rules/** — パス別の詳細ルール（自動ロード）
   - `coding-style.md` — イミュータビリティ・ファイル分割・エラー処理・品質チェックリスト
   - `git-workflow.md` — コミット規約・PR・実装ワークフロー
   - `orchestration.md` — エージェントオーケストレーション（SSoT）
   - `security.md` — セキュリティチェック・シークレット管理
   - `testing.md` — テスト方針
5. **docs/memory/** — 成功事例ログ（MEMORY.mdから退避した過去記録。通常は参照不要）

## 3. Workflow Rules

- タスクを受けたら、自律的な探索やコード変更を始める前に、まず確認の質問をすること。ファイル読み込みに30秒以上かけず、アプローチをユーザーに確認してから着手する。
- 変更は最小限かつ焦点を絞る。依頼された範囲を超えてスコープを拡大しないこと。追加変更が必要と判断した場合は、先に確認する。
- ツール（Bash, Edit, Write等）を呼び出す**前に**、そのツールが何をするか・実行するとどうなるかを日本語テキストで簡潔に説明すること。ユーザーが許可プロンプトで判断できるようにする目的。説明なしにいきなりツールを呼ばない。

## 4. Tech Stack & Commands

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Language | TypeScript | ^5 |
| CSS | Tailwind CSS v4 | ^4 |
| Component | shadcn/ui + Radix UI | — |
| Animation | Motion (Framer Motion) | 12.x |
| DB | PostgreSQL + Prisma | 6.17.x |
| Push通知 | web-push (VAPID) | 3.6.x |
| Test | Node.js test runner + Playwright | — |
| Icons | Lucide React + Material Symbols | — |

> CSS生成時はTailwind v4構文を使用。TSXファイル編集時は日本語文字のエンコーディングを正確に保持すること。時刻はDBにUTC保存、表示はJST(+9h)。Prisma Clientはシングルトン（`src/lib/prisma.ts`）。

```bash
cd kaji-app
npm install              # 初回セットアップ
npm run dev              # 開発サーバー起動
npm run build            # プロダクションビルド（prisma generate含む）
npm run lint             # ESLint実行
npm run test             # テスト（unit + integration）
npm run test:unit        # ユニットテストのみ
npm run test:integration # 統合テストのみ（PowerShell）
npm run db:up            # ローカルDB起動（Docker）
npm run db:down          # ローカルDB停止
npm run db:init          # ローカルDB初期化
npm run db:seed:senri    # テストデータ投入
npx prisma migrate dev   # マイグレーション実行
npx prisma db push       # スキーマ直接反映（開発用）
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | ユーザー登録・ログイン |
| GET | `/api/bootstrap` | 初期データ一括取得 |
| POST | `/api/logout` | セッションクリア |
| PATCH | `/api/user` | ユーザー情報更新 |
| GET/POST | `/api/chores` | 家事一覧・作成 |
| GET/PATCH/DELETE | `/api/chores/[id]` | 家事取得・更新・削除 |
| POST | `/api/chores/[id]/record` | 家事実績記録 |
| GET | `/api/records` | 実績一覧（直近200件） |
| DELETE | `/api/records/[id]` | 実績削除 |
| POST/DELETE | `/api/records/[id]/reaction` | リアクション追加・削除 |
| GET | `/api/assignments` | 家事割り当て一覧 |
| GET | `/api/stats` | 統計（期間別） |
| GET | `/api/my-stats` | 個人統計 |
| GET | `/api/household-report` | 世帯レポート |
| POST | `/api/household/join` | 招待コードで世帯参加 |
| GET/PATCH | `/api/notification-settings` | 通知設定 |
| POST | `/api/subscriptions` | Push購読管理 |
| GET/POST | `/api/custom-icons` | カスタムアイコン管理 |
| PATCH/DELETE | `/api/custom-icons/[id]` | アイコン更新・削除 |
| POST | `/api/schedule-override` | 予定上書き |
| DELETE | `/api/schedule-override/[id]` | 予定上書き削除 |
| GET | `/api/schedule-overrides` | 予定上書き一覧 |
| GET | `/api/calendar-month-summary` | カレンダー月サマリー |
| GET/POST | `/api/sync` | 多端末同期ポーリング |
| POST | `/api/cron/reminders` | リマインダー送信（Cron） |
| POST | `/api/notifications/test` | テスト通知 |

## 5. Architectural Rules (The Rules)

### DB Schema

**PostgreSQL + Prisma:**
- `Household`: id, inviteCode, reminderTimes[], 通知設定フラグ群 → users[], chores[], records[]
- `User`: id, householdId, name(unique), passwordHash, color → household, records[], reactions[]
- `Chore`: id, householdId, title, icon, intervalDays, defaultAssigneeId, archived → records[], assignments[], occurrences[]
- `ChoreRecord`: id, householdId, choreId, userId, memo, scheduledDate, isSkipped, performedAt → reactions[]
- `ChoreRecordReaction`: id, recordId, userId, emoji
- `ChoreAssignment`: id, choreId, userId, date
- `ChoreScheduleOverride`: id, choreId, date
- `ChoreOccurrence`: id, choreId, dateKey, status(pending/consumed), sourceType
- `PushSubscription`: id, householdId, userId, endpoint, p256dh, auth
- `CustomIcon`: id, householdId, label, icon, iconColor, bgColor

> スキーマ詳細: `kaji-app/prisma/schema.prisma`

### Session

- Cookie-based Session（ステートレス）: `kaji_user_id`, `kaji_household_id`
- 属性: `httpOnly: true`, `sameSite: lax`, `secure: true`（本番）、有効期限365日
- セッション管理: `src/lib/session.ts`（getSession, setSession, clearSession）
- API認証: `src/lib/api.ts`の`requireSession()`でCookie検証
- パスワード: scrypt（N=16384, r=8, p=1）、Legacy対応あり（パスワードなしユーザー）
- OAuth未使用 — 独自Cookie方式

### Environment Variables

| 変数 | 用途 | デフォルト |
|------|------|-----------|
| `DATABASE_URL` | PostgreSQL接続文字列 | — (必須) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push公開鍵 | — (Push通知時必須) |
| `VAPID_PRIVATE_KEY` | Web Push秘密鍵 | — (Push通知時必須) |
| `VAPID_SUBJECT` | Web Push主体（mailto:） | — (Push通知時必須) |
| `KAJI_ENABLE_DEMO_DATA` | デモデータ自動生成 | — (任意) |

### Key Patterns

- **SPA構成**: App Routerだが実質SPA。メインUI=`src/components/kaji/kaji-app.tsx`（タブ: ホーム/一覧/統計/設定）
- **JST時刻管理**: `src/lib/time.ts` — DB保存はUTC、表示はJST。startOfJstDay, toJstDateKey等
- **API共通処理**: `src/lib/api.ts` — requireSession, readJsonBody, badRequest
- **多端末同期**: `src/lib/sync.ts` — touchHousehold()でupdatedAt更新、クライアントポーリング
- **ChoreOccurrence**: スケジュール発生の読み取りモデル。重複累積バグ修正済み（PR #55）
- **スワイプ操作**: use-edge-swipe-back, use-swipe-delete, use-swipe-tab（モバイルUX）
- **テーマ**: light/dark + 4色（orange/blue/emerald/rose）、localStorage管理

### Design Assets

- PWA Manifest: `kaji-app/public/manifest.webmanifest`（name: "いえたすく", display: standalone）
- Service Worker: `kaji-app/public/sw.js`
- アイコン: `icon-192-v2.png`, `icon-512-v2.png`, maskable版, apple-touch-icon
- Pencilデザイン: `docs/design/`（kajiApp_phase1.pen, kajiApp_phase2.pen, new_ui*.pen）

## 6. Agent Orchestration（最重要）

メインエージェントは **オーケストレーター** に徹する。自ら調査・コード変更をしない。

→ 詳細ルール・パイプライン定義は `.claude/rules/orchestration.md` を参照（SSoT）。

## 7. Core Principles (The Workflows)

1. **Plan & Verify**: 変更前に影響範囲を確認。楽観ロック・型定義・フラグの副作用を把握してから着手
2. **Simplicity First**: 最小限の変更で目的を達成。不要な抽象化・先回り実装は避ける
3. **SSoT (Single Source of Truth)**: 情報は1箇所に定義し、他はポインタで参照。重複定義は禁止
