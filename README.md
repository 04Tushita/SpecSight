# SpecSight

SpecSight checks AI-generated code against the specs of a task **before** it goes to peer review.

This repository is an interactive, clickable demo of the product, built for usability sessions with software engineers. Everything runs in the browser: there is no backend and nothing is sent anywhere.

## The story in the demo

1. **VS Code.** You attach task `#184527` ("Notification preferences revert after page refresh", 5 specs) to the AI agent by typing `#`. The agent reads the task, edits `NotificationSettings.tsx` and finishes.
2. **SpecSight opens.** The Proof Lens starts as a closed eye while it reads the 5 specs, then opens and tests every spec on a sandbox copy of the app.
3. **Spec 3 is unclear**, so it asks for context while the other specs keep testing. You can paste the Product Owner's reply or ask him from SpecSight.
4. **Spec 2 and Spec 4 break** (the agent never calls `savePreferences()`). Send the suggested fix to the agent, or investigate in VS Code and fix it yourself.
5. **Only what changed is re-tested.** When all 5 specs pass, the Proof Capsule (every recording) seals itself.
6. Optional: **Try it yourself** in the sandbox and save your own steps as a test.
7. **PR summary** written from the test log, with export (text, Markdown, Word, PDF, image), then **Create pull request**.

Extras: a full-screen Proof Lens map (`F`), recordings you can scrub anywhere, a mascot eye whose iris shows each spec's status and whose expression follows what is happening, and a **Demo** menu (top right) to restart or jump to a step.

- **Guided steps** (on by default): a card points at the next thing to click and lists optional actions. Turn it off with **Guide on/off** in the top bar.
- **Source control**: the agent's edits appear live with +/− counts while it types; open a file to compare it side by side.
- **See changes** on the PR summary opens every changed file in VS Code, before and after, with the changed words highlighted.
- **Try your own test case** warns when the text doesn't read like a test case.
