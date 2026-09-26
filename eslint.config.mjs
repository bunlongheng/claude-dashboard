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
            "*.config.mjs",
            "*.config.ts",
            "*.config.js",
            "next-env.d.ts",
            ".claude/**",
        ],
    },
    ...next,
    {
        // The lint script runs --max-warnings 0, so a warning fails CI the same
        // as an error. Keep the React-Compiler-style rules (react-hooks v6) at
        // error so the config says what CI does.
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "react-hooks/set-state-in-effect": "error",
            "react-hooks/purity": "error",
            "react-hooks/refs": "error",
            "react-hooks/static-components": "error",
            "react-hooks/immutability": "error",
            "react/no-unescaped-entities": "error",
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
