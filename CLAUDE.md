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
- **Fallback layers:** every path that can't animate shows `Fallback2D`, a static Canvas 2D gradient that matches the shader's two colors. If you change the shader palette, update `Fallback2D` to match. The fallback is used in three cases:
  1. `prefers-reduced-motion`, via `hooks/usePrefersReducedMotion.ts`. That hook uses `useSyncExternalStore`, and its server snapshot returns `true`, so SSR and the first render show the fallback.
  2. No WebGL support, via the R3F `<Canvas fallback>` prop.
  3. Runtime or shader-compile errors, via `ShaderErrorBoundary`.
- **Performance:** the `<Canvas>` is configured deliberately for low GPU load: `dpr={[1, 1.5]}`, `antialias: false`, `depth: false`. The pause button sets `frameloop="never"`. Keep these settings unless you mean to change GPU cost.
