# opencode-beemspec

Scaffold package for BeemSpec's OpenCode integration surface.

Current scope:

- hook contracts for `experimental.session.compacting` and `experimental.chat.system.transform`
- event contract for `session.created`, `session.updated`, `session.idle`, and `session.error`
- tool contracts for `beemspec_story` and `beemspec_blocked`

This package is intentionally implementation-light in this phase. It exists so BeemSpec app code can target stable contracts while runtime integration details continue to harden.
