import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MermaidBlock, CodeBlock, downloadMermaidSvg } = await jiti.import("./MermaidBlock.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { loadPrismLanguages } = await jiti.import("@/lib/prism-languages");

// Simple sequenceDiagram for testing
const mermaidSrc = `sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`;

function renderMermaid(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MermaidBlock, props),
    ),
  );
}

test("MermaidBlock renders source by default", () => {
  const html = renderMermaid({ code: mermaidSrc });

  assert.match(html, />Preview</);
  assert.match(html, /Alice/);
  assert.doesNotMatch(html, /mermaid-block-loading/);
});

test("MermaidBlock can render preview by default", () => {
  const html = renderMermaid({ code: mermaidSrc, defaultPreview: true });

  assert.match(html, />Source</);
  assert.match(html, /mermaid-block-loading/);
  assert.doesNotMatch(html, /Alice/);
});

test("MermaidBlock with isStreaming falls back to source view", () => {
  const html = renderMermaid({ code: mermaidSrc, isStreaming: true, defaultPreview: true });

  assert.match(html, /disabled/);
  assert.match(html, />Preview</);
  assert.match(html, /Alice/);
  assert.match(html, /-&gt;&gt;/);
});

test("MermaidBlock renders empty graph without error", () => {
  const html = renderMermaid({ code: "graph TD", defaultPreview: true });

  assert.doesNotMatch(html, /mermaid-block-error/);
  assert.match(html, /mermaid-block-loading/);
});

function renderCode(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(CodeBlock, props),
    ),
  );
}

/** How many rows the fence lays out: one per line, and no number column beside them. */
function codeRows(html) {
  return [...html.matchAll(/<span class="markdown-code-line"><span class="(?:token )?markdown-code-line-text"/g)].length;
}

/** The code as the page shows it. */
function shownCode(html) {
  return html.match(/<code\b[^>]*>([\s\S]*)<\/code>/)[1]
    .replace(/<[^>]+>/g, "")
    .replaceAll("&quot;", "\"").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

const wrapSample = "const x = 1;\n    indented(\"https://example.invalid/a/b/c\");\n\nlast();";

test("CodeBlock renders one row per line, without tokens, until the Prism languages load", () => {
  const html = renderCode({ code: "const x = 1;\nlet y = 2;", lang: "javascript" });

  assert.doesNotMatch(html, /class="token/);
  assert.doesNotMatch(html, /linenumber/);
  assert.equal(codeRows(html), 2);
  assert.match(html, /const x = 1;/);
  const fallback = renderCode({ code: wrapSample, lang: "javascript" });
  assert.equal(codeRows(fallback), 4);
  assert.equal(shownCode(fallback), wrapSample);
});

test("CodeBlock highlights code when not streaming", async () => {
  await loadPrismLanguages();
  const html = renderCode({ code: "const x = 1;", lang: "javascript" });

  assert.match(html, /class="token/);
  assert.match(html, /const/);
});

test("CodeBlock sets each line as its own wrapping row, so a long line wraps under its text (#1360)", () => {
  const html = renderCode({ code: wrapSample, lang: "javascript" });

  assert.match(html, /class="token/);
  // A row per line, holding only the text that wraps (app/globals.css), so a long
  // line goes on under its own text.
  assert.equal(codeRows(html), 4);
  assert.equal(shownCode(html), wrapSample);
});

test("CodeBlock keeps a block comment's color on every line it spans", () => {
  const html = renderCode({ code: "/* one\n   two\n   three */\nlet x;", lang: "javascript" });

  // The comment's middle line is a row of its own, styled by the row's classes.
  const first = html.match(/<span class="token" style="([^"]*)">\/\* one\n<\/span>/)?.[1];
  const middle = html.match(/<span class="token markdown-code-line-text" style="([^"]*)">   two\n<\/span>/)?.[1];
  assert.ok(first);
  assert.equal(middle, first);
  assert.equal(codeRows(html), 4);
});

test("CodeBlock clears the highlighter's own pre fill without a competing shorthand", () => {
  for (const isStreaming of [false, true]) {
    const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming });
    const pre = html.match(/<pre\b[^>]*>/)?.[0];
    assert.ok(pre);
    // A fence draws no surface, and the longhand is what overrides the Prism
    // theme's own fill; the e2e that switches themes checks it stays cleared.
    assert.match(pre, /background-color:transparent/);
    assert.doesNotMatch(pre, /(?:[;\"]|^)background:/);
  }
});

test("CodeBlock renders plain text without tokenization while streaming", () => {
  const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming: true });

  assert.doesNotMatch(html, /class="token/);
  assert.match(html, /const x = 1;/);
  // A streamed block wraps its long lines too, instead of scrolling sideways.
  const pre = html.match(/<pre\b[^>]*>/)?.[0];
  assert.match(pre, /white-space:pre-wrap/);
  assert.match(pre, /overflow-wrap:anywhere/);
  assert.doesNotMatch(pre, /overflow-x/);
});

test("MermaidBlock handles Chinese characters in diagram", () => {
  const chineseMermaid = `sequenceDiagram
    participant PC as PC客户端
    PC->>SV: 请求登录`;

  const html = renderMermaid({ code: chineseMermaid, defaultPreview: true });

  assert.doesNotMatch(html, /mermaid-block-error/);
  assert.match(html, /mermaid-block/);
});

test("downloadMermaidSvg downloads XML-serialized SVG and releases its URL", async () => {
  const originalDocument = globalThis.document;
  const originalXMLSerializer = globalThis.XMLSerializer;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const svgElement = { nodeName: "svg" };
  const serializedSvg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">first<br />second</div></foreignObject></svg>';
  const link = { href: "", download: "", clicked: false, click() { this.clicked = true; } };
  let downloadedBlob;
  globalThis.document = { createElement: () => link };
  globalThis.XMLSerializer = class {
    serializeToString(element) {
      assert.equal(element, svgElement);
      return serializedSvg;
    }
  };
  URL.createObjectURL = (blob) => {
    assert.equal(blob.type, "image/svg+xml;charset=utf-8");
    downloadedBlob = blob;
    return "blob:mermaid";
  };
  let revoked = null;
  URL.revokeObjectURL = (url) => { revoked = url; };

  try {
    downloadMermaidSvg(svgElement);
    assert.equal(await downloadedBlob.text(), serializedSvg);
    assert.equal(link.href, "blob:mermaid");
    assert.equal(link.download, "mermaid-diagram.svg");
    assert.equal(link.clicked, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(revoked, "blob:mermaid");
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalXMLSerializer === undefined) delete globalThis.XMLSerializer;
    else globalThis.XMLSerializer = originalXMLSerializer;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
