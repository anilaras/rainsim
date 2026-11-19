# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a curious general audience. Typically someone arriving from a shared link, wondering "do I get less wet if I run or walk in the rain?", who spends a few minutes changing parameters and watching the result. They are not expected to know fluid dynamics or Monte Carlo methods, and they are not here to produce reports.

Other uses that the existing features support (saved results table, CSV export, method notes) remain available, but they are secondary audiences and not confirmed as primary.

## Product Purpose

A browser-based 3D simulator that computes how much water an object (a person, box, cylinder or sphere) collects while moving through rain, and shows where it gets wet. It exists to answer the everyday walk-or-run question with a real physical model instead of a guess, and to let people explore how rain intensity, drop size, wind and speed change the answer.

Success: a visitor understands the answer to their question (total wetting, and how it changes with speed) within a short session, and enjoys getting there.

## Positioning

A real per-drop particle simulation in the object's reference frame, intersected against the object's triangle mesh, running live in the browser with no install. The result is checked against an analytic expectation and shown with a statistical uncertainty. The fidelity is real, but the experience leads with curiosity and discovery: the physics runs correctly in the background while the visual scene drives the experience.

## Operating Context

- Opened directly from a link or from `index.html`; no account, no install, no server-side state.
- Session shape: pick a preset (drizzle → storm) or tune parameters, press start (or skip to result), watch the 3D scene and heat map, read the total, compare speeds on the "walk or run" curve.
- Keyboard shortcuts (Space start/pause, R reset) and orbit/zoom camera controls on the 3D view.
- Saved results and CSV export exist for people who want to compare runs.

## Capabilities and Constraints

- Inputs: rain (intensity mm/h, drop volume, size variation, fall speed auto/manual), wind (speed, compass direction relative to motion, turbulence), object (shape and dimensions, height above ground, speed, distance or duration, retention %), simulation (particle count, speed, heat-map scale, visibility toggles). Some can change mid-run; shape, size or height changes reset the run.
- Outputs: total wetting (ml/L, grams, drop count), analytic expectation and difference, 1σ uncertainty, per-surface distribution, heat map (ml/m²), accumulation-over-time chart, total-vs-speed curve, saved results table, CSV export.
- Physics: Atlas et al. (1973) terminal velocity; drop diameter from volume; per-particle weights chosen to reproduce the set rain rate exactly; analytic expectation exact for convex shapes, approximate for the human model (no self-shadowing).
- **No build step.** Plain HTML/CSS/JS; opening `index.html` must be enough. three.js 0.160.0 loads from the jsDelivr CDN, so an internet connection is required.
- **Must work on mobile** (phones and tablets), not only on the current three-column desktop layout.
- **Deployed as a static site on GitHub Pages** (repository `anilaras/rainsim`, `.nojekyll` present).
- Language: the UI is currently Turkish (`lang="tr"`). Whether it stays Turkish-only or becomes multilingual is undecided.

## Brand Commitments

- Name: "Yağmur Simülatörü".

## Evidence on Hand

- The method is documented in `README.md` and in the in-app "Nasıl hesaplanıyor?" section, citing Atlas et al. (1973).
- No user testimonials, usage numbers, press or external validation exist. Do not invent any.

## Product Principles

1. **Answer the question first.** The visitor came with "walk or run?"; the total and the speed comparison must be reachable and understandable without reading the method.
2. **Curiosity over control panel.** Lead with the scene and the result. Expose depth through progressive disclosure instead of front-loading every parameter.
3. **Honest physics in the background.** Never trade correctness for spectacle. Analytic comparison and uncertainty remain available to anyone who looks for them.
4. **Zero friction.** A link opens a working simulation on any device. No install, no build, no account.
