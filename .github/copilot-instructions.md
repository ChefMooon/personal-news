# GitHub Copilot Instructions

Follow the repository-root `AGENTS.md` for shared project architecture, coding conventions, validation commands, and safety constraints. Keep project guidance in `AGENTS.md` so Codex, Copilot, and other agents can use the same source of truth.

Apply any matching Copilot-specific instructions under `.github/instructions/` and use Copilot agent profiles under `.github/agents/` for tool-specific roles. Check `package.json` and `package-lock.json` for current versions, and prefer established repository patterns over newer APIs or external conventions.
