import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadVerificationComponents() {
  const result = await build({
    stdin: {
      contents: `
        export { default as VerificationGatePage, downloadReceipt } from "./src/components/VerificationGatePage.jsx";
        export { default as SettlementCheckPage } from "./src/pages/SettlementCheckPage.jsx";
        export { default as ProvenanceCheckPage } from "./src/pages/ProvenanceCheckPage.jsx";
        export { default as CustodyCheckPage } from "./src/pages/CustodyCheckPage.jsx";
        export { default as EdgeVerifyPage } from "./src/pages/EdgeVerifyPage.jsx";
        export { api, API_BASE_URL } from "./src/utils/apiClient.js";
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: "esm", jsx: "automatic",
    define: { "import.meta.env.VITE_API_BASE_URL": '"https://verification.test"' },
    plugins: [{
      name: "node-component-hooks",
      setup(builder) {
        builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, ({ path }) => ({ path, namespace: "test-react" }));
        builder.onLoad({ filter: /.*/, namespace: "test-react" }, ({ path }) => ({
          contents: path === "react/jsx-runtime"
            ? 'export const Fragment = Symbol.for("test.fragment"); export function jsx(type, props, key) { return { type, props: props || {}, key }; } export const jsxs = jsx;'
            : 'export const useState = (...args) => globalThis.__governanceHooks.useState(...args); export const useRef = (...args) => globalThis.__governanceHooks.useRef(...args); export const useEffect = (...args) => globalThis.__governanceHooks.useEffect(...args);',
        }));
      },
    }],
  });
  const directory = await mkdtemp(join(tmpdir(), "verification-component-tests-"));
  const file = join(directory, "components.mjs");
  await writeFile(file, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
