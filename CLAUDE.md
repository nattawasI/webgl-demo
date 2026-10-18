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

Next.js 16 (App Router) with React 19, `@react-three/fiber` 9 and `three`, plus Tailwind CSS v4. Tailwind is wired through a Turbopack loader rule in `next.config.ts` (`@tailwindcss/turbopack`), not PostCSS. `next.config.ts` also turns on `cacheComponents` and `partialPrefetching`. Imports use the `@/` alias for the repo root.

Because the Next.js version is newer than most training data, check `node_modules/next/dist/docs/` for APIs you don't recognize. For example, `ShaderErrorBoundary` uses `catchError` from `next/error`, documented at `01-app/03-api-reference/04-functions/catchError.md`.

## Architecture

This is a single-page WebGL shader demo. `app/page.tsx` (a server component) renders `components/ShaderCanvas.tsx`, which is a client component and holds the whole demo.

- **Shader:** GLSL vertex and fragment shaders are inline template strings in `ShaderCanvas.tsx`. The vertex shader writes clip space directly (`position.xy`) on a 2×2 plane, so the quad fills the screen without any camera math. The two color blobs drift on their own (time only). The mouse spiral-twists the coordinates around it with strength `uHover`, which fades in/out as the pointer enters/leaves the page. Uniforms `uTime`, `uMouse`, `uAspect` and `uHover` are updated in `useFrame`. `delta` is clamped to 0.1 so time doesn't jump after the tab was in the background, and `uMouse` eases toward the pointer instead of snapping to it. The uniforms object is memoized: when the `uniforms` prop changes, R3F copies the new values over the old ones, so an inline object would reset `uTime` on every re-render.
- **Fallback layers:** `Fallback2D` is a static Canvas 2D drawing of the shader's first frame (same palette, blob positions and grain). If you change the shader palette or blob positions, update `Fallback2D` to match. It always sits underneath the shader at a fixed tree position, so it is never remounted, and it redraws on resize via `ResizeObserver`. The shader layer fades in over it after its first frame. It is what shows when:
  1. The page first paints. `hooks/usePrefersReducedMotion.ts` uses `useSyncExternalStore`, and its server snapshot returns `true`, so SSR renders only the fallback.
  2. The user prefers reduced motion. The hook listens for changes at runtime.
  3. WebGL is unavailable, or the shader throws. three.js throws when it can't create a context, and `ShaderErrorBoundary` (Next's `catchError`) renders `null`, which removes the shader and the pause bar together. The R3F `<Canvas fallback>` prop does not cover this case: R3F renders it as children of its `<canvas>`, which browsers only show when `<canvas>` itself is unsupported.
  4. The WebGL context is lost mid-session. A `webglcontextlost` listener drops the shader layer and the bar.

  Because R3F always mounts its `fallback` inside its hidden `<canvas>`, a zero-size `Fallback2D` instance exists whenever the shader runs. `draw()` returns early at zero size; `getImageData` throws there, and `ShaderErrorBoundary` would then kill the shader.
- **Performance:** the `<Canvas>` is configured deliberately for low GPU load: `dpr={[1, 1.5]}`, `antialias: false`, `depth: false`. The pause button sets `frameloop="demand"`: one more frame is drawn with time frozen and lighter grain (`GRAIN_STILL`, because frozen grain looks much harsher than moving grain), and R3F redraws that still frame on resize. `Fallback2D` uses the same still-frame grain strength. Keep these settings unless you mean to change GPU cost.
