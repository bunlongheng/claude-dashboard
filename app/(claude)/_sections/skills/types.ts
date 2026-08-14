export type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
export type SkillInfo = { name: string; plugin: string; description: string; path: string; source?: "builtin" | "external"; content?: string; createdAt?: string };
