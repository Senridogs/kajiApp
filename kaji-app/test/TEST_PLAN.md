# kajiApp テスト計画書

## 現状分析

### 既存テスト
- **ユニットテスト (10ファイル)**: `time`, `dashboard`, `helpers`, `home-order`, `schedule-policy`, `notifications`, `calendar-month-summary`, `dialog-consistency`, `schedule-override-route`, `ui-layout`
- **統合テスト (1ファイル)**: `api-flow-check.mts` - APIエンドポイントの結合テスト (DB必須)

### テストされていない領域
1. **ユーティリティ関数**: `darkenColor`, `lightenColor`, `maxCount`, `formatJpDate`, `formatMonthDay`, `formatDateShort`, `formatTopDate`, `urlBase64ToUint8Array`, `iconByName`
2. **ビジネスロジック**: `buildRecurrenceDateKeys`, `resolveScheduleWindow`, `buildReactionPayload`
3. **E2Eテスト**: ブラウザ操作による画面遷移・UI操作テストが未実施
4. **ビルド検証**: `next build` が成功するかの確認テスト

---

## テスト実施内容

### Phase 1: ユニットテスト拡充 (DB不要・即時実行可能)

#### 1-1. helpers 追加テスト
- `darkenColor` / `lightenColor` の色変換テスト
- `maxCount` のエッジケーステスト
- `formatJpDate`, `formatMonthDay`, `formatDateShort`, `formatTopDate` 日時フォーマットテスト
- `urlBase64ToUint8Array` バイナリ変換テスト
- `iconByName` アイコン解決テスト

#### 1-2. schedule-policy 追加テスト
- `buildRecurrenceDateKeys` の繰り返し日程生成テスト
- `resolveScheduleWindow` のウィンドウ計算テスト
- `dateKeyToJstDate`, `uniqueSortedDateKeys` ユーティリティテスト

#### 1-3. notifications 追加テスト
- `buildReactionPayload` リアクション通知テスト

#### 1-4. dashboard 追加テスト
- `computeChore` スキップレコード時の表示テスト
- `computeChore` 実施記録なし（createdAt基準）のテスト
- `getStatsRange` 各期間キー (`week`, `month`, `half`, `year`, `all`) テスト

### Phase 2: E2Eテスト (Playwright)
- ブラウザ起動 → ユーザー登録 → ホーム画面表示
- 家事の追加 → 完了記録 → ステータス変更の確認
- タブ遷移（ホーム / カレンダー / 実績 / 記録）
- 設定画面の操作
- レスポンシブ表示（モバイルビューポート）

### Phase 3: ビルド検証
- `next build` が正常完了すること
