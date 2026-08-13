import next from "eslint-config-next";

const eslintConfig = [
    {
        ignores: [
            "node_modules/**",
            ".next/**",
            "dist/**",
            "build/**",
            "coverage/**",
            "public/**",
            "app/(claude)/_sections/coverage/**",
            "scripts/**",
            "*.config.mjs",
            "*.config.ts",
            "*.config.js",
            "next-env.d.ts",
            ".claude/**",
        ],
    },
    ...next,
    {
        // Adopting lint on an existing codebase: the React-Compiler-style rules
        // (react-hooks v6) flag many pre-existing patterns. Keep them visible as
        // warnings so CI is not blocked; burn them down over time.
        rules: {
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/purity": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/static-components": "warn",
            "react-hooks/immutability": "warn",
            "react/no-unescaped-entities": "warn",
            // Source is now any-free - keep it that way (0 sites; new any fails CI).
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
    {
        // Tests legitimately use `any` for mocks/fixtures; keep the strict rule to source.
        files: ["tests/**", "**/*.test.ts", "**/*.test.tsx"],
        rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
];

export default eslintConfig;
