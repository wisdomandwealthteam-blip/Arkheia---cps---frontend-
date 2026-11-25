// Browser-free handler tests: render source components with a minimal hook adapter.
// Production JSX/React compatibility is checked independently by npm run build.
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadComponents() {
  const result = await build({
    stdin: {
      contents: 'export { default as App } from "./src/App.jsx"; export { default as GovernanceCheckPage } from "./src/pages/GovernanceCheckPage.jsx"; export { api, API_BASE_URL } from "./src/utils/apiClient.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    define: { "import.meta.env.VITE_API_BASE_URL": '"https://governance.test"' },
    plugins: [{
      name: "node-component-hooks",
      setup(builder) {
        builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, ({ path }) => ({ path, namespace: "test-react" }));
        builder.onLoad({ filter: /.*/, namespace: "test-react" }, ({ path }) => ({
          contents: path === "react/jsx-runtime"
            ? 'export const Fragment = Symbol.for("test.fragment"); export function jsx(type, props, key) { return { type, props: props || {}, key }; } export const jsxs = jsx;'
            : 'export const useState = (...args) => globalThis.__governanceHooks.useState(...args); export const useRef = (...args) => globalThis.__governanceHooks.useRef(...args); export const useEffect = (...args) => globalThis.__governanceHooks.useEffect(...args); export const useCallback = (fn) => fn;',
        }));
      },
    }],
  });
  const directory = await mkdtemp(join(tmpdir(), "governance-component-tests-"));
  const file = join(directory, "components.mjs");
  await writeFile(file, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function componentHarness(Component, props = {}) {
  const slots = [];
  const effects = [];
  let index = 0;
  let tree;
  const hooks = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => {
        slots[slot] = typeof value === "function" ? value(slots[slot]) : value;
      }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(fn, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[slot] = { deps, cleanup: fn() };
        });
      }
    },
  };
  return {
    render() {
      index = 0;
      globalThis.__governanceHooks = hooks;
      tree = Component(props);
      effects.splice(0).forEach((effect) => effect());
      return tree;
    },
    get tree() { return tree; },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

export function walk(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const match = walk(item, predicate);
      if (match) return match;
    }
    return null;
  }
  if (predicate(tree)) return tree;
  return walk(tree.props?.children, predicate);
}

export function text(tree) {
  if (tree === null || tree === undefined || tree === false) return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}

export function button(tree, label) {
  return walk(tree, (element) => element.type === "button" && text(element) === label);
}

export function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand);
  if (!tree || typeof tree !== "object") return tree;
  if (typeof tree.type === "function") return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
}

export function mockBrowser(start = "/") {
  const urls = [new URL(start, "https://frontend.test")];
  const states = [{}];
  let position = 0;
  const listeners = new Map();
  const browser = {
    location: urls[0],
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
    history: {
      get state() { return states[position]; },
      pushState(state, title, value) {
        urls.splice(position + 1);
        states.splice(position + 1);
        urls.push(new URL(value, browser.location));
        states.push(state);
        browser.location = urls[++position];
      },
      replaceState(state, title, value) {
        urls[position] = new URL(value, browser.location);
        states[position] = state;
        browser.location = urls[position];
      },
      back() {
        if (position > 0) { browser.location = urls[--position]; listeners.get("popstate")?.(); }
      },
      forward() {
        if (position < urls.length - 1) { browser.location = urls[++position]; listeners.get("popstate")?.(); }
      },
      get length() { return urls.length; },
    },
    setTimeout,
    clearTimeout,
    get listenerCount() { return listeners.size; },
  };
  return browser;
}
