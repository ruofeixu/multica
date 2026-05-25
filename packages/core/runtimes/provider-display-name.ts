/** Human-readable labels for runtime provider ids (CLI / agent backends). */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
  cursor: "Cursor Agent",
  gemini: "Gemini",
  hermes: "Hermes",
  kimi: "Kimi",
  kiro: "Kiro CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  pi: "Pi",
};

export function providerDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}
