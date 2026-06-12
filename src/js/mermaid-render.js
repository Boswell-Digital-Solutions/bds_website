import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
});

async function renderMermaid() {
  const blocks = document.querySelectorAll("pre.mermaid");
  if (!blocks.length) {
    return;
  }

  for (const pre of blocks) {
    const code = pre.textContent;
    const container = document.createElement("div");
    container.className = "mermaid";
    container.textContent = code ?? "";
    pre.replaceWith(container);
  }

  await mermaid.run();
}

renderMermaid();
