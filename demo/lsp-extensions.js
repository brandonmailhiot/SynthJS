import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import { hoverTooltip } from "@codemirror/view";
import {
  getCompletions,
  getDiagnostics,
  getHover,
  positionToOffset,
} from "synth-javascript";

// Convert a service Position (1-indexed) into a CodeMirror offset.
function offsetFromOneIndexed(source, pos) {
  return positionToOffset(source, pos);
}

export function synthLinter() {
  return linter((view) => {
    const source = view.state.doc.toString();
    const diags = getDiagnostics(source);
    return diags.map((d) => {
      const from = offsetFromOneIndexed(source, d.range.start);
      const to = offsetFromOneIndexed(source, d.range.end);
      const message = d.suggestion
        ? `${d.message}\nDid you mean '${d.suggestion}'?`
        : d.message;
      return {
        from: Math.min(from, to),
        to: Math.max(from, to),
        severity: d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info",
        message,
        source: "synthjs",
      };
    });
  });
}

export function synthHover() {
  return hoverTooltip((view, pos) => {
    const source = view.state.doc.toString();
    const info = getHover(source, pos);
    if (!info) return null;
    const from = offsetFromOneIndexed(source, info.range.start);
    const to = offsetFromOneIndexed(source, info.range.end);
    return {
      pos: from,
      end: to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-tooltip-cursor synth-hover";
        for (const block of info.contents) {
          const p = document.createElement("p");
          p.innerHTML = renderInlineMarkdown(block);
          dom.appendChild(p);
        }
        return { dom };
      },
    };
  });
}

function renderInlineMarkdown(text) {
  // Tiny inline markdown: **bold**, `code`. No HTML in source allowed.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function synthCompletions() {
  return autocompletion({
    activateOnTyping: true,
    override: [
      (context) => {
        const source = context.state.doc.toString();
        const completions = getCompletions(source, context.pos);
        if (completions.length === 0) return null;
        // Find word boundary for the replace range
        const word = context.matchBefore(/[\w\\@]*/);
        const from = word ? word.from : context.pos;
        return {
          from,
          options: completions.map((c) => ({
            label: c.label,
            type: completionTypeFor(c.kind),
            detail: c.detail,
            info: c.documentation,
          })),
          validFor: /^[\w\\@]*$/,
        };
      },
    ],
  });
}

function completionTypeFor(kind) {
  switch (kind) {
    case "keyword": return "keyword";
    case "function": return "function";
    case "variable": return "variable";
    case "directive": return "namespace";
    case "annotation": return "type";
    case "pitch": return "constant";
    case "duration": return "constant";
    case "instrument": return "class";
    case "effect": return "function";
    case "mode": return "enum";
    default: return "text";
  }
}
