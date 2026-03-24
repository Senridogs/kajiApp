# Testing Requirements

## Minimum Test Coverage: 80%

Test framework: Vitest（バージョンは `CLAUDE.md` Tech Stack参照）

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (Playwright)

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+): `npm run test -- --coverage`

## Troubleshooting Test Failures

1. Check test isolation
2. Verify mocks are correct
3. Fix implementation, not tests (unless tests are wrong)

> エージェント運用（tdd-guide, e2e-runner のトリガー・タイミング等）は `.claude/rules/orchestration.md` を参照。
