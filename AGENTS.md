# AGENTS.md — SkeletonStructure

This is a navigation file for coding agents. It does not replace the engineering skill.

For any substantive work in this repository:

1. Read [`.agents/skills/skeletonstructure-engineering/SKILL.md`](./.agents/skills/skeletonstructure-engineering/SKILL.md) before acting. Also read any nested `AGENTS.md` closer to the files you touch.
2. Verify the branch, `HEAD`, working tree, and remote state: `git status --short --branch`, `git rev-parse HEAD`, `git diff`, `git ls-remote --heads origin`.
3. Read the dated [current state](./.agents/skills/skeletonstructure-engineering/references/current-state.md), [feature inventory](./.agents/skills/skeletonstructure-engineering/references/feature-inventory.md), [roadmap](./.agents/skills/skeletonstructure-engineering/references/roadmap.md), and applicable [decisions](./.agents/skills/skeletonstructure-engineering/references/architectural-decisions.md). Verify implementation directly before relying on prior reports.
4. Use a dedicated branch for each task; never work directly on `main`. Keep commits focused, run relevant checks, review the complete diff, push, and open a PR for completed repository changes unless the user explicitly says not to commit or push.
5. Never merge without explicit authorization; never force-push, overwrite work, or run destructive Git operations without permission. Never claim a PR was created or a check passed if it was not.
6. Keep documentation aligned with current implementation. Mark replaced decisions `Superseded` with a link to the replacement; do not silently rewrite vision, principles, or the long-term roadmap.

If your agent does not support `AGENTS.md`, read `.agents/skills/skeletonstructure-engineering/SKILL.md` directly. If any required check cannot be performed, state the limitation explicitly.
