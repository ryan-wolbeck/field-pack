import type { BinderExport } from "../types/models";
import { binderToMarkdown } from "./markdown";

export function printBinder(data: BinderExport): void {
  const escaped = escapeHtml(binderToMarkdown(data));
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("The browser blocked the print window.");
  }

  popup.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(data.binder.name)} - Field Pack</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 32px auto; line-height: 1.5; color: #1f2a25; }
      pre { white-space: pre-wrap; font-family: inherit; }
    </style>
  </head>
  <body><pre>${escaped}</pre></body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
