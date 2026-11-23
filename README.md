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

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # static site in dist/
```

`dist/` is a plain static site, so it can be hosted on Netlify, GitHub Pages or any static host (build command `npm run build`, publish directory `dist`).

### Netlify

`netlify.toml` is included: in Netlify choose **Add new site → Import an existing project**, pick this repository, and deploy. The build settings are read from the file.

## Code map

| File | What it holds |
| --- | --- |
| `src/data.js` | The task, specs, test cases, source files shown in the editor and the scripted recordings |
| `src/store.js` | App state and the simulation (agent, test runs, fixes, timings) |
| `src/Mascot.jsx` | The SpecSight eye and its moods |
| `src/Lens.jsx` | The Proof Lens (also the opening eye) |
| `src/VSCode.jsx` | VS Code window, agent chat and the investigate panel |
| `src/SpecSight.jsx` | The main SpecSight window, test log, code, clarify and Ask Dan panels |
| `src/FullMap.jsx` | The full-screen spec map |
| `src/Sandbox.jsx` | Try it yourself and Save it as a test |
| `src/Finish.jsx` | Summary, export, Proof Capsule player and the pull request |
| `src/XyzApp.jsx` | The XYZ Company settings app used in the sandbox and the recordings |

Design and research: Tushita Kaul, NC State MGXD.
