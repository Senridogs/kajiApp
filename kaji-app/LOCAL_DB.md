# ローカルDBセットアップ

このプロジェクトは Prisma + PostgreSQL を使います。

## 1) ローカル PostgreSQL を起動

```bash
npm run db:up
```

DBコンテナの設定:
- サービス名: `postgres`
- ポート: `5432`
- データベース名: `kaji_app`
- ユーザー名: `ieApp`
- パスワード: `ieApp`

## 2) ローカルDBに Prisma スキーマを反映

```bash
npm run db:init:local
```

`db:init:local` は常に次の接続先を使います:

```dotenv
DATABASE_URL="postgresql://ieApp:ieApp@localhost:5432/kaji_app?schema=public"
```

`.env` の `DATABASE_URL` には依存しないため、本番DB設定には影響しません。

## 3) アプリをローカルDBで起動

```bash
npm run dev:local
```

`dev:local` は `DATABASE_URL` をローカルDBに固定して起動します。
`npm run dev` は `.env` の `DATABASE_URL` をそのまま使うため注意してください。

## 便利コマンド

```bash
npm run db:logs
npm run db:down
npm run db:down:volumes
npm run db:init
npm run db:init:current-env
npm run db:seed:senri
```

- `db:down:volumes`: DBデータのボリュームも削除します。
- `db:init`: 安全なローカル初期化モードです（`db:init:local` と同じ）。
- `db:init:current-env`: 現在の `DATABASE_URL` をそのまま使います。
- `db:seed:senri`: 既存 `senri` を基準に `nozomi` と家事/履歴ダミーデータを追加します。
