# Canvass starter

A tested kernel plus the documents Claude Code needs to build the rest.

- `CLAUDE.md` is read automatically by Claude Code: what exists, the stack, the twelve rules.
- `docs/PRODUCT.md` is why it exists: purpose-built for the public sector, the ladder of ways to respond, the trust rules.
- `docs/SPEC.md` is the product and architecture.
- `docs/NO_TERMINAL.md` is how everything is run from a browser.
- `docs/BUILD_PLAN.md` is the milestones, acceptance criteria, and the pilot gate.
- `docs/KERNEL.md` maps the code in `src/core` and `src/db`.
- `docs/KICKOFF_PROMPT.md` is what to paste first.
- `docs/prototype.html` is the clickable prototype.
- `templates/brandeis-records-2026/study.yaml` is the first study.
- `tests/` holds 37 passing tests over the kernel.

## Getting it live without a terminal

1. Create a new private repository on github.com and upload this folder.
2. Open the repository in Claude Code and paste the kickoff prompt.
3. When Milestone 0 is done, create a project from the repository in the Railway dashboard,
   add a Postgres database, and set the variables listed in `docs/DEPLOY.md`.
4. Visit the site. The setup checklist takes it from there.

Start the sending domains warming today. It takes two to three weeks and nothing here shortens it.
