/**
 * Test helpers for loading vanilla JS source files into vitest.
 *
 * The extension's JS files declare globals (no ES modules).
 * We eval them into the test scope and provide browser API stubs.
 */

import { readFileSync } from "fs";
import { join } from "path";

var ROOT = join(import.meta.dirname, "..");

/**
 * Load a source file, eval its contents, and return all globals it created.
 * Provide stubs for browser APIs that would fail in Node.
 */
export function loadSource(filename, extraGlobals) {
  var code = readFileSync(join(ROOT, filename), "utf-8");

  // Minimal stubs for browser APIs
  var globals = {
    fetch: async function () { throw new Error("fetch not stubbed"); },
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    document: {
      createElement: function () { return {}; },
    },
    URL: globalThis.URL,
    Date: globalThis.Date,
    console: globalThis.console,
    crypto: globalThis.crypto,
    Promise: globalThis.Promise,
    JSON: globalThis.JSON,
    Math: globalThis.Math,
    parseInt: globalThis.parseInt,
    isNaN: globalThis.isNaN,
    t: function (key) { return key; },
    ...extraGlobals,
  };

  // Build a function that exposes globals and captures declarations
  var fn = new Function(
    ...Object.keys(globals),
    code + "\n; return { " + extractExports(code) + " };"
  );

  return fn(...Object.values(globals));
}

/**
 * Rough extraction of top-level var/function declarations from source code.
 */
function extractExports(code) {
  var exports = [];
  var lines = code.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Match: var NAME, const NAME, function NAME, async function NAME
    var match = line.match(/^(?:var|const|let)\s+([A-Z_$][A-Z_$0-9]*)\s*=/i);
    if (match) { exports.push(match[1]); continue; }
    match = line.match(/^(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z_$0-9]*)/);
    if (match) { exports.push(match[1]); }
  }
  return exports.map(function (name) { return name + ": typeof " + name + " !== 'undefined' ? " + name + " : undefined"; }).join(", ");
}
