import { type ComponentType, createElement, lazy } from "react";

export interface Preloadable<P extends object> {
  Component: ComponentType<P>;
  preload: () => Promise<ComponentType<P>>;
}

/**
 * A component kept out of the bundle of the screen that mounts it, loaded on
 * demand. Unlike a bare `lazy`, once `preload` has resolved it renders in the
 * same commit instead of suspending for one frame, so a dialog opened after the
 * prefetch gets its content, and its first field the focus, on the first paint.
 * Render it under a `Suspense` for the opening that beats the prefetch.
 */
export function preloadable<P extends object>(
  load: () => Promise<ComponentType<P>>,
): Preloadable<P> {
  let loaded: ComponentType<P> | undefined;
  const preload = () =>
    load().then((component) => {
      loaded = component;
      return component;
    });
  const Deferred = lazy(() => preload().then((component) => ({ default: component })));

  // biome-ignore lint/correctness/noComponentHookFactories: called once at module scope, never during a render, so the component identity is stable
  function Component(props: P) {
    return createElement(loaded ?? Deferred, props);
  }

  return { Component, preload };
}
