# Contributing to Claude Dashboard

Thanks for your interest in contributing! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/bunlongheng/claude-dashboard.git
cd claude-dashboard
npm install
npm run dev
```

Open http://localhost:3003. `npm run dev:full` also starts the WebSocket watcher on 7878 (live agents feed).

This project targets Node 20 (see .nvmrc). Run `nvm use` before installing so `better-sqlite3` builds against the right ABI (the app falls back to a no-op adapter when the native module is missing).

## How to Contribute

1. **Fork** the repo
2. **Create** a branch (`git checkout -b feature/my-feature`)
3. **Make** your changes
4. **Verify** - the same gates CI runs, in this order:

   | Command | Checks |
   |---------|--------|
   | `npm run lint` | ESLint, 0 warnings allowed |
   | `npx tsc --noEmit` | Types |
   | `npm test` | Vitest unit tests (Testing Library + MSW) |
   | `npm run test:e2e` | Playwright, only for route or UI changes; needs `npm run dev` on 3003 |
   | `npm run build` | Plain `next build`; icons sync separately via `npm run sync-icons` |

5. **Enable the pre-push hook** once: `git config core.hooksPath .githooks`. It runs typecheck, lint and unit tests before every push (never the build or E2E)
6. **Commit** with a clear message
7. **Push** and open a **Pull Request**

## Guidelines

- Keep PRs focused - 1 feature or fix per PR
- Follow existing code style
- Test your changes locally before submitting
- No breaking changes without discussion first

## Reporting Bugs

Open an [issue](https://github.com/bunlongheng/claude-dashboard/issues) with:
- What you expected
- What happened
- Steps to reproduce
- Your OS and Node.js version

## Feature Requests

Open an issue with the `enhancement` label. Describe the use case and why it would be useful.

## Database Adapters

Want to add support for a new database (PostgreSQL, MySQL, etc.)?
1. Create `lib/db/yourdb.ts` implementing the `DbAdapter` interface in `lib/db/types.ts`
2. Add detection logic in `lib/db/index.ts`
3. Submit a PR

---

Maintained by [Bunlong Heng](https://www.bunlongheng.com)
