// The web app's "@/..." import alias (tsconfig.json's paths), for dependency-cruiser, which reads aliases from a
// webpack-style resolve block. Only the web app uses it.
"use strict";
const path = require("node:path");

module.exports = { resolve: { alias: { "@": path.join(__dirname, "src") } } };
