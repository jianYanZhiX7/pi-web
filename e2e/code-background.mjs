import assert from "node:assert/strict";

/** The fixture has one ordinary fence and one Mermaid diagram. */
export async function checkCodeBackground(page) {
  const warnings = [];
  const onConsole = (message) => {
    if (/conflicting property|style property during rerender/.test(message.text())) {
      warnings.push(message.text());
    }
  };
  page.on("console", onConsole);
  const source = page.getByRole("button", { name: "Source", exact: true });
  await source.click();
  const blocks = page.locator(".markdown-code-block pre");
  await blocks.nth(1).waitFor();
  try {
    for (const colorScheme of ["light", "dark", "light", "dark", "light"]) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, colorScheme);
      await page.waitForFunction(() => {
        const nodes = [...document.querySelectorAll(".markdown-code-block pre")];
        return nodes.length === 2 && nodes.every((node) => (
          getComputedStyle(node).backgroundColor === "rgba(0, 0, 0, 0)"
          && getComputedStyle(node).borderTopWidth === "0px"
          && getComputedStyle(node.querySelector("code")).backgroundColor === "rgba(0, 0, 0, 0)"
        ));
      });
    }
    assert.deepEqual(warnings, [], "Theme switches must not mix background shorthand and backgroundColor");
  } finally {
    page.off("console", onConsole);
    await page.emulateMedia({ colorScheme: "light" });
  }
  console.log("PASS: code and Mermaid source blocks stay unfilled across repeated theme switches");
}
