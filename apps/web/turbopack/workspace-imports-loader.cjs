// A Turbopack loader for our workspace packages' TypeScript: they import "./brand.js" for "./brand.ts", as
// Node's module resolution wants, and Turbopack can't map one to the other yet (vercel/next.js#82945).
"use strict";

/** Relative specifiers ending in .js after `from`, or inside `import(` / `export ... from`. */
const relativeJsSpecifier = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*?)\.js\2/g;

/** The source with ".js" dropped from relative import specifiers, so Turbopack finds the .ts file. */
function withoutJsExtensions(source) {
  return source.replace(relativeJsSpecifier, "$1$2$3$2");
}

module.exports = function workspaceImportsLoader(source) {
  return withoutJsExtensions(source);
};
module.exports.withoutJsExtensions = withoutJsExtensions;
