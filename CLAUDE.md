# AgentSlack Development Guidelines

## Testing

Every feature change, bug fix, or refactor to source files **must** include corresponding unit tests. Run `npm test` before committing to verify all tests pass.

- Test framework: **Vitest** (config in `vitest.config.ts`)
- Test location: `__tests__/` directory, mirroring source structure
- Run tests: `npm test` (single run) or `npm run test:watch` (watch mode)
- Coverage: `npx vitest run --coverage` — maintain >70% overall coverage
- Mocking patterns: use `vi.hoisted()` for mock variables used inside `vi.mock()` factories
- API route tests: mock `next-auth`, `@/lib/db`, `@/server/socket-server`, `@/server/agent-daemon` as needed

## Commits

Do not include `Co-Authored-By` lines in commit messages.
