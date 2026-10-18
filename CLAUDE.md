# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Language

Always reply to the user in Thai. Code, comments and commit messages stay in English.

## Commands

Package manager is pnpm (pinned via `packageManager`).

- `pnpm dev`: dev server at http://localhost:3000 (Turbopack). Running it also rewrites `AGENTS.md`.
- `pnpm build`: production build; this is also the type check.
- `pnpm lint`: ESLint (flat config, `eslint-config-next` core-web-vitals + typescript).

There is no test setup.

## Stack

Next.js 16 (App Router) with React 19 and Tailwind CSS v4. The shader runs on plain WebGL 1, with no three.js or React Three Fiber: it is a single full-screen fragment shader, and those libraries made up about 60% of the page's JS. Tailwind is wired through a Turbopack loader rule in `next.config.ts` (`@tailwindcss/turbopack`), not PostCSS. `next.config.ts` also turns on `cacheComponents` and `partialPrefetching`. Imports use the `@/` alias for the repo root.

Because the Next.js version is newer than most training data, check `node_modules/next/dist/docs/` for APIs you don't recognize. For example, `ShaderErrorBoundary` uses `catchError` from `next/error`, documented at `01-app/03-api-reference/04-functions/catchError.md`.

## Architecture

This is a single-page WebGL shader demo. `app/page.tsx` (a server component) renders `components/ShaderCanvas.tsx`, which is a client component and holds the whole demo.

- **Shader:** GLSL vertex and fragment shaders are inline template strings in `ShaderCanvas.tsx`. One oversized triangle covers the viewport, in clip space with no camera. The fragment shader asks for `highp` where available, because at mediump (16-bit on many phones) the grain hash breaks into visible patterns. The three color blobs drift on their own (time only). The mouse spiral-twists the coordinates around it with strength `uHover`, which fades in/out as the pointer enters/leaves the page.
- **WebGL setup and loop:** all of it lives in one `useEffect` in `ShaderLayer`: context creation, compile/link, the `requestAnimationFrame` loop, `ResizeObserver` sizing, pointer tracking and context-loss handling. Animation state (`time`, `hover`, `mouse`) lives in local variables there, not React state. `draw(dt)` sets the uniforms and draws; `dt` is clamped to 0.1 so time doesn't jump after the tab was in the background, and `draw(0)` gives a still frame. The `paused` prop reaches the loop through `setPausedRef`, so pausing doesn't rebuild the GL setup. `onFail` must stay stable (`useCallback`), or the effect re-runs.
- **Fallback layers:** `Fallback2D` is a static Canvas 2D drawing of the shader's first frame (same palette, blob positions and grain). If you change the shader palette or blob positions, update `Fallback2D` to match. It always sits underneath the shader at a fixed tree position, so it is never remounted, and it redraws on resize via `ResizeObserver`. The shader layer fades in over it after its first frame. It is what shows when:
  1. The page first paints. `hooks/usePrefersReducedMotion.ts` uses `useSyncExternalStore`, and its server snapshot returns `true`, so SSR renders only the fallback.
  2. The user prefers reduced motion. The hook listens for changes at runtime.
  3. WebGL is unavailable, or the shader fails to compile or link. `ShaderLayer` calls `onFail` and the parent unmounts it.
  4. The WebGL context is lost mid-session. A `webglcontextlost` listener calls `onFail` too.

  The pause bar is rendered by `ShaderLayer` and only after the first frame is drawn, so it never shows without an animation. `ShaderErrorBoundary` (Next's `catchError`, renders `null`) is only a safety net for anything unexpected thrown while rendering the layer. `Fallback2D`'s `draw()` returns early at zero size, because `getImageData` throws there.
- **Performance:** the WebGL context is set up deliberately for low GPU load: device pixel ratio capped at `MAX_DPR` (1.5), `antialias: false`, `depth: false`, `alpha: false`, `powerPreference: 'low-power'`. Pausing stops the loop and draws one still frame with lighter grain (`GRAIN_STILL`, because frozen grain looks much harsher than moving grain). The resize handler redraws that still frame when the loop isn't running, since resizing clears the canvas. `Fallback2D` uses the same still-frame grain strength. Keep these settings unless you mean to change GPU cost.
