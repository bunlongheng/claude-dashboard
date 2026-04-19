# Contributing to Claude Dashboard

Thanks for your interest in contributing! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/bunlongheng/claude-dashboard.git
cd claude-dashboard
npm install
npm run dev
```

Open http://localhost:3000

## How to Contribute

1. **Fork** the repo
2. **Create** a branch (`git checkout -b feature/my-feature`)
3. **Make** your changes
4. **Test** - run `npm run build` to verify
5. **Commit** with a clear message
6. **Push** and open a **Pull Request**

## Guidelines

- Keep PRs focused - one feature or fix per PR
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

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Maintained by [Bunlong Heng](https://www.bunlongheng.com)
