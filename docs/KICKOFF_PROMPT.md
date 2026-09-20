# Kickoff prompt

Put this folder in a new GitHub repo, open it in Claude Code (the desktop app works, no
terminal needed on your side), and paste the text below as your first message.

---

You are picking up a project called Canvass. A tested kernel and full documentation already
exist. Before writing any code:

1. Read `CLAUDE.md`, then the documents it lists, in order. Open `docs/prototype.html`.
2. Install dependencies and run the kernel tests and the type check. Confirm all 37 pass.
3. Tell me, briefly, what you understand the product to be, and list anything in the docs or
   the kernel that is ambiguous, wrong, or that you would do differently, with your reasoning.
4. Ask me the open items in section 14 of the spec that block Milestones 0 and 1 only.
5. Propose the folder structure for the Next.js app around the kernel, and wait for approval.

After I approve, build Milestone 0 only. Work one milestone at a time from then on. At the end
of each, run the tests, report against the acceptance criteria, list anything deferred, and stop.

Two things matter more than anything else. Hold to the twelve rules in `CLAUDE.md`, and tell me
before doing anything I ask that would break one. And remember rule 10: I run this from a
browser. Whenever you finish something, tell me which screen I use it from. If the answer
involves a command, it is not finished.

---

## Prompts for later

Starting a milestone:

> Build Milestone N from `docs/BUILD_PLAN.md`. Restate its acceptance criteria, write the tests,
> then the code. Put new rules in `src/core` with tests, and keep routes thin.

Before the pilot:

> Walk through the pilot gate in `docs/BUILD_PLAN.md`. For each line, show me the evidence that
> it holds, or tell me what is missing.

When something breaks in production:

> Here is what I saw on screen: <paste>. Find the cause, fix it, add a test, and make sure the
> console would show a clearer message next time.
