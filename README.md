# Smart Self-Checkout

An open-source self-checkout system designed to streamline and accelerate in-store shopping by enabling customers to pay for all their purchases directly without waiting in line.

> This project is developed by a group of students at **VNU-HCMUS** (VNUHCM - University of Science) for the **Introduction to Software Engineering** course.

---

## Features & Evaluation

### Strengths
- **Barcode Reader**: Fast and seamless product identification via barcode scanning.
- **Payment Integration**: Convenient digital and multi-channel payment processing.
- **Personal Customization**: Tailored user checkout experiences and flexible options.

### Limitations & Challenges
- **No Physical Verification**: Absence of in-person verification or staff auditing at exit.
- **Shrinkage Risk**: Susceptible to shoplifting, missed scans, or partial payments by dishonest clients.

---

## Repository Rules & Governance

### GitHub Branch Protection Rules (`main`)
The `main` branch is protected by repository rulesets (`Protect main branch (Team)`):
- **No Direct Pushes**: Direct pushes to `main` are disabled; all changes must arrive via Pull Requests.
- **Pull Request Requirements**:
  - Requires at least **1 approving review** before merging.
  - **Dismiss stale reviews**: New commits automatically invalidate previous approvals.
  - **Require conversation resolution**: All review comments and discussions must be resolved prior to merge.
  - **Require extra approval** for unattributed changes.
- **Require Linear History**: Merge commits that violate linear progression or non-fast-forward pushes are blocked.
- **Block Force Pushing & Deletion**: Branch deletion and `--force` pushes are strictly prohibited for all users without bypass.

---

## Agentic Workflow & Guidelines

- **AI Agent Guidelines**: Detailed development standards, safety principles, and commit message conventions for AI agents (AGY, Codex, etc.) are documented in [AGENTS.md](AGENTS.md).
- **Automated AI Review Workflow**: CI automation located in [.github/workflows/ai-pr-review.yml](.github/workflows/ai-pr-review.yml) reviews incoming Pull Requests using Google Gemini.
  - **Opt-in Trigger**: To conserve API tokens, automated reviews only run when `[ai-review]` is included in the PR title or description (or when the `ai-review` label is applied).
  - **Summary & Walkthrough**: When triggered, the agent generates an approval verdict, a high-level PR summary, a file-by-file changes walkthrough, and recommendations evaluated against [AGENTS.md](AGENTS.md).
