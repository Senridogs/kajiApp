# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## Feature Implementation Workflow

1. **Plan First**
   - 実装計画を策定し、依存関係・リスクを特定
   - フェーズに分解する

2. **TDD Approach**
   - テストを先に書く（RED → GREEN → REFACTOR）
   - カバレッジ80%以上を確認
   - 詳細は `.claude/rules/testing.md` 参照

3. **Code Review**
   - コード変更後に品質レビューを実施
   - CRITICAL・HIGH を必ず対処、MEDIUM も可能な限り対処

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format

> エージェントの具体的な運用（planner, tdd-guide, code-reviewer等）は `.claude/rules/orchestration.md` を参照。
