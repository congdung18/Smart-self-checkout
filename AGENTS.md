# Agent Guidelines & Project Instructions

This document provides operational rules and guidelines for AI coding agents (AGY, Codex, etc.) working in this repository.

---

## 1. Core Operating Principles & Safety

- **Never push directly to main.**
  - Always develop within dedicated feature or bugfix branches (e.g., `feat/feature-name`, `fix/issue-description`).
  - All updates to `main` must arrive exclusively through Pull Requests.
- **Always run tests and linters before reporting completion.**
  - Verify all changes locally: code must compile, pass existing unit/integration tests, and satisfy linter/formatter checks before concluding a task.
- **Never create or commit mock API keys, tokens, or credentials.**
  - Never place fake, mock, staging, or production secrets, tokens, or API keys directly in source code or committed files.
  - Document required environment variables with blank placeholders in `.env.example`.

---

## 2. Git & Commit Conventions

All commit messages must follow the convention:

```text
action: brief introduction

[optional detailed introduction / context]
```

### Guidelines:
- **`action`**: A concise category describing the change, such as:
  - `feat`: Adding a new feature or functionality.
  - `fix`: Resolving an issue or bug.
  - `refactor`: Structural code improvements without behavioral changes.
  - `test`: Adding or updating test coverage.
  - `docs`: Updating documentation or specifications.
  - `chore`: Tooling, build system, or dependency updates.
- **`brief introduction`**: A clear, concise summary of the change in the imperative mood (e.g., `feat: add barcode scanner input handler`).
- **Detailed Introduction**: Feel free to add detailed paragraphs or bullet points beneath the header explaining the rationale, edge cases considered, or migration notes.

---

## 3. Code Quality & Architecture

- **Scope Discipline**: Keep changes clean, minimal, and focused on the immediate task. Avoid reformatting unrelated files or touching unrequested components.
- **Input Validation**: Validate inputs at system boundaries (API endpoints, CLI inputs, external payloads).
- **Clean State**: Ensure no leftover debug statements, temporary logs, or scratch files are committed.
