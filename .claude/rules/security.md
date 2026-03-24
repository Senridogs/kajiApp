# Security Guidelines

## Mandatory Security Checks

Before ANY commit:

### 実装済み — 毎回確認
- [ ] No hardcoded secrets — `.env.local` に集約、コード内にURL/キー直書きなし
- [ ] User inputs validated — Zod schema でバリデーション（API routes）
- [ ] Authentication/authorization — Cookie認証（`kaji_user_id`, `kaji_household_id`）。API保護は`requireSession()`
- [ ] Error messages safe — エラーレスポンスに内部情報（stack trace, DB構造）を含めない
- [ ] XSS prevention — React のデフォルトエスケープ + dangerouslySetInnerHTML 禁止

### 自動保護（フレームワーク依存）
- CSRF — `sameSite: lax` Cookieで緩和。APIはPOST/PATCH/DELETEで状態変更
- SQL injection — Prisma ORM使用（パラメータ化クエリ自動適用）

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const DATABASE_URL = "https://xxxxx.example.com"

// ALWAYS: Environment variables（定義一覧は CLAUDE.md Environment Variables参照）
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL not configured')
}
```

## Security Response Protocol

If security issue found:
1. STOP immediately
2. CRITICAL issues を先に修正
3. Rotate any exposed secrets
4. Review entire codebase for similar issues

> エージェント運用（security-reviewer のトリガー・タイミング等）は `.claude/rules/orchestration.md` を参照。
