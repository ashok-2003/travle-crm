/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "db-internals-stay-in-db",
      comment:
        "Other packages reach @travel-crm/db only through its entry points (index, identity, platform, webhooks, " +
        "rate-limits, sheet-schedule, sheets-key-check, meta-routes, whatsapp-routes, and the test-only testing files), so the raw Prisma client and the generated code never leak " +
        "out of the package.",
      severity: "error",
      from: { path: "^(apps|packages)/", pathNot: "^packages/db/" },
      to: {
        path: "^packages/db/(src|test)/",
        pathNot:
          "^packages/db/(src/(index|identity|platform|webhooks|rate-limits|sheet-schedule|sheets-key-check|meta-routes|whatsapp-routes)|test/(testing|global-setup))\\.ts$",
      },
    },
    {
      name: "identity-database-only-in-identity",
      comment:
        "@travel-crm/db/identity reaches Better Auth's sign-in tables, which have no row-level security. " +
        "Only the identity module may use it (spec section 4).",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/(src|test)/identity/"] },
      to: { path: "^packages/db/src/identity\\.ts$" },
    },
    {
      name: "webhook-events-only-in-webhooks",
      comment:
        "@travel-crm/db/webhooks reaches webhook_event, which has no organization_id and no row-level security: " +
        "every organization's raw provider payloads. Only the webhooks module may use it (ADR 0013).",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/(src|test)/webhooks/"] },
      to: { path: "^packages/db/src/webhooks\\.ts$" },
    },
    {
      name: "rate-limit-counters-only-in-rate-limits",
      comment:
        "@travel-crm/db/rate-limits reaches rate_limit_counter, which has no organization_id and no row-level " +
        "security. Only the rate-limits module may use it (ADR 0013).",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/(src|test)/rate-limits/"] },
      to: { path: "^packages/db/src/rate-limits\\.ts$" },
    },
    {
      name: "sheet-schedule-only-in-sheets",
      comment:
        "@travel-crm/db/sheet-schedule reaches sheet_check_schedule and sheet_spreadsheet_claim, which carry " +
        "organization_id but have no row-level security (ids, times and a keyed hash only; ADR 0031). Only the " +
        "sheets module's schedule.ts may use it, and the tests that arrange or read those tables.",
      severity: "error",
      from: {
        pathNot: ["^packages/db/", "^packages/domain/(src/sheets/schedule\\.ts|test/(sheets|performance|platform)/)"],
      },
      to: { path: "^packages/db/src/sheet-schedule\\.ts$" },
    },
    {
      name: "meta-routes-only-in-meta-leads",
      comment:
        "@travel-crm/db/meta-routes reaches meta_page_route, which carries organization_id but has no row-level " +
        "security (ids and times only; ADR 0034). Only the meta-leads module's routes.ts may use it, and the tests " +
        "that arrange or read that table.",
      severity: "error",
      from: {
        pathNot: [
          "^packages/db/",
          "^packages/domain/(src/meta-leads/routes\\.ts|test/(meta-leads|performance|platform)/)",
        ],
      },
      to: { path: "^packages/db/src/meta-routes\\.ts$" },
    },
    {
      name: "whatsapp-routes-only-in-inbox",
      comment:
        "@travel-crm/db/whatsapp-routes reaches whatsapp_number_route and whatsapp_unrouted, which have no row-level " +
        "security (ids, numbers and counts only; ADR 0035). Only the inbox module's routes.ts may use it, and the tests " +
        "that arrange or read those tables.",
      severity: "error",
      from: {
        pathNot: ["^packages/db/", "^packages/domain/(src/inbox/routes\\.ts|test/(inbox|performance|platform)/)"],
      },
      to: { path: "^packages/db/src/whatsapp-routes\\.ts$" },
    },
    {
      name: "sheets-key-check-only-in-the-api-start-up",
      comment:
        "@travel-crm/db/sheets-key-check reaches sheets_key_check, which has no organization_id and no row-level " +
        "security (one keyed hash of a constant, SC8). Only the api's sheets-key-check.ts, which every process runs at " +
        "start-up, and its test may use it.",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^apps/api/(src|test)/sheets-key-check(\\.test)?\\.ts$"] },
      to: { path: "^packages/db/src/sheets-key-check\\.ts$" },
    },
    {
      name: "platform-database-only-in-platform",
      comment:
        "@travel-crm/db/platform sees every organization. Only the platform module and tests may use it; " +
        "the api and worker never get DATABASE_PLATFORM_URL.",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/src/platform/", "(^|/)test/"] },
      to: { path: "^packages/db/src/platform\\.ts$" },
    },
    {
      name: "platform-module-only-in-the-console",
      comment:
        "@travel-crm/domain/platform opens the platform role's connection (createPlatformServices) and runs the " +
        "console's work on it. Only the console process (apps/api/src/console*.ts), the console's own tRPC " +
        "(packages/api/src/platform/) and tests may import it: never the api server or the worker, which hold no " +
        "DATABASE_PLATFORM_URL, nor any other domain module.",
      severity: "error",
      from: {
        pathNot: [
          "^packages/domain/src/platform/",
          "^packages/api/src/platform/",
          "^apps/api/src/console[^/]*\\.ts$",
          "(^|/)test/",
        ],
      },
      to: { path: "^packages/domain/src/platform/" },
    },
    {
      name: "console-routers-only-in-the-console",
      comment:
        "The console's tRPC (packages/api/src/platform/, served as @travel-crm/api/platform) runs on the platform's " +
        "services. Only the console process (apps/api/src/console*.ts) and tests may import it, so @travel-crm/api's " +
        "own entry, which the api server and the web app import, never carries it. The web app's console screens " +
        "type their calls with it: web-console-types-the-platform-router-only.",
      severity: "error",
      from: {
        pathNot: [
          "^packages/api/src/platform/",
          "^apps/api/src/console[^/]*\\.ts$",
          "(^|/)test/",
          "^apps/web/src/console/",
        ],
      },
      to: { path: "^packages/api/src/platform/" },
    },
    {
      name: "web-console-types-the-platform-router-only",
      comment:
        "The web app's console screens (apps/web/src/console) know the console's procedures by the PlatformRouter " +
        "type alone: an import of @travel-crm/api/platform's entry and no other file of it, and a type import, as " +
        "web-reaches-the-api-over-http holds every import of the api.",
      severity: "error",
      from: { path: "^apps/web/src/console/" },
      to: { path: "^packages/api/src/platform/", pathNot: "^packages/api/src/platform/index\\.ts$" },
    },
    {
      name: "web-console-code-only-in-the-console",
      comment:
        "The console's screens and data layer (apps/web/src/console) are the console's alone: only its own files, " +
        "its routes (apps/web/src/app/console) and tests import them, so no organization screen reaches the " +
        "console's tRPC client or its cache. The app reaches the console by its address (routes.console).",
      severity: "error",
      from: {
        path: "^apps/web/",
        pathNot: ["^apps/web/src/console/", "^apps/web/src/app/console/", "^apps/web/test/"],
      },
      to: { path: "^apps/web/src/console/" },
    },
    {
      name: "api-and-worker-never-load-the-platform",
      comment:
        "Nothing the api server or the worker runs may reach the platform module or the console's tRPC, even through " +
        "other files: their code would then be loaded in a process that holds no DATABASE_PLATFORM_URL (ADR 0019).",
      severity: "error",
      from: { path: ["^apps/api/src/(?!console)[^/]+\\.ts$", "^packages/api/src/(?!platform/)"] },
      to: { path: ["^packages/domain/src/platform/", "^packages/api/src/platform/"], reachable: true },
    },
    {
      name: "db-testing-only-in-tests",
      comment: "@travel-crm/db/testing starts Postgres containers and creates organizations. Only tests may use it.",
      severity: "error",
      from: { pathNot: ["^packages/db/", "(^|/)test/"] },
      to: { path: "^packages/db/test/" },
    },
    {
      name: "integrations-testing-only-in-tests",
      comment: "@travel-crm/integrations/testing builds images for tests (bombs among them). Only tests may use it.",
      severity: "error",
      from: { pathNot: "(^|/)test/" },
      to: { path: "^packages/integrations/test/" },
    },
    {
      name: "raw-database-drivers-stay-in-db",
      comment:
        "Only packages/db may import the database drivers (pg, @prisma/client, @prisma/adapter-pg). " +
        "Everything else goes through db.forOrg(), so row-level security cannot be skipped.",
      severity: "error",
      from: { pathNot: "^packages/db/" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
        path: "(^|/)node_modules/(pg|@prisma/client|@prisma/adapter-pg)(/|$)",
      },
    },
    {
      name: "domain-modules-meet-at-their-index",
      comment:
        "Each domain module's public API is its index.ts (spec 8). Inside a module, import its own files freely; " +
        "from another module, import only that module's index.ts.",
      severity: "error",
      from: { path: "^packages/domain/src/([^/]+)/" },
      to: {
        path: "^packages/domain/src/",
        pathNot: ["^packages/domain/src/$1/", "^packages/domain/src/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "domain-modules-from-outside-through-their-index",
      comment: "Other packages import a domain module only through its index.ts, as @travel-crm/domain/<module>.",
      severity: "error",
      from: { path: "^(apps|packages)/", pathNot: "^packages/domain/" },
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/[^/]+/index\\.ts$" },
    },
    {
      name: "business-modules-call-down",
      comment:
        "The business modules are layered (spec 6, 8): catalog, tasks, imports, exports, sheets, meta-leads and website-forms at L0, crm at L1, " +
        "today, inbox, insights, quotes, finance, sales and reports above them. A module calls only down: the L0 modules never call crm, today or insights, " +
        "and crm never calls today or insights. An action spanning two modules is the higher one's, or its router " +
        "calls both (R22).",
      severity: "error",
      from: { path: "^packages/domain/src/(catalog|tasks|imports|exports|sheets|meta-leads|website-forms|crm)/" },
      to: {
        path: "^packages/domain/src/(crm|inbox|today|insights|quotes|finance)/",
        pathNot: "^packages/domain/src/$1/",
      },
    },
    {
      name: "imports-and-exports-never-call-sheets",
      comment:
        "The Sheets sync stands on imports (headerKey, guessFields, rowFingerprint), never the other way: crm unions " +
        "the sheets' fingerprints with imports' own (spec 6.2), so imports and exports never call sheets.",
      severity: "error",
      from: { path: "^packages/domain/src/(imports|exports)/" },
      to: { path: "^packages/domain/src/sheets/" },
    },
    {
      name: "imports-and-exports-never-call-meta-leads",
      comment:
        "The Meta lead ads' import of a form's earlier leads stands on imports, never the other way: the worker hands " +
        "imports a function for the form's source (metaSource), so imports and exports never call meta-leads.",
      severity: "error",
      from: { path: "^packages/domain/src/(imports|exports)/" },
      to: { path: "^packages/domain/src/meta-leads/" },
    },
    {
      name: "kernel-depends-on-no-module",
      comment: "The shared kernel is the bottom layer (spec 8): modules use it, it uses no module.",
      severity: "error",
      from: { path: "^packages/domain/src/kernel/" },
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/kernel/" },
    },
    {
      name: "kernel-is-browser-safe",
      comment:
        "The web app's client code imports the kernel (money, GST, dates), so it imports only itself and " +
        "@travel-crm/contracts: never @travel-crm/integrations (pg-boss, Node built-ins), a Node built-in or any " +
        "other package. apps/api/test/browser-safe-kernel.test.ts bundles it for a browser.",
      severity: "error",
      from: { path: "^packages/domain/src/kernel/" },
      to: { pathNot: ["^packages/domain/src/kernel/", "^packages/contracts/"] },
    },
    {
      name: "vendor-sdks-only-in-integrations",
      comment:
        "Domain code never calls a vendor SDK (spec 3): it calls a port in @travel-crm/integrations, and only that " +
        "package imports pg-boss, the AWS SDK, nodemailer, web-push, pino, React-PDF or the spreadsheet libraries " +
        "(csv-parse, csv-stringify, read-excel-file, fflate, saxen; ADR 0030) and google-auth-library (ADR 0031).",
      severity: "error",
      from: { pathNot: "^packages/integrations/" },
      to: {
        path:
          "(^|/)node_modules/(pg-boss|pino|@aws-sdk/[^/]+|nodemailer|web-push|@react-pdf/[^/]+|csv-parse|csv-stringify|" +
          "read-excel-file|fflate|saxen|google-auth-library)(/|$)",
      },
    },
    {
      name: "integrations-are-adapters-only",
      comment:
        "Adapters know vendors, not our business: @travel-crm/integrations imports nothing of ours but the brand " +
        "package. Its tests may use the test database.",
      severity: "error",
      from: { path: "^packages/integrations/src/" },
      to: { path: "^(apps|packages)/", pathNot: ["^packages/integrations/", "^packages/brand/"] },
    },
    {
      name: "brand-depends-on-nothing-of-ours",
      comment:
        "The brand package is the product's identity: every layer may read it, so its code reads no other package.",
      severity: "error",
      from: { path: "^packages/brand/src/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/brand/" },
    },
    {
      name: "web-reaches-the-api-over-http",
      comment:
        "The web app imports the API's types, never its code (spec 3): it reaches data through /api. At run time it " +
        "may use the brand, the contracts' schemas (for forms) and the kernel's money and date formatting, nothing " +
        "that touches the database, the server or a vendor. apps/web/test is outside it on purpose: the journeys " +
        "seed organizations through @travel-crm/domain/identity and @travel-crm/db/platform, and unit tests may read " +
        "the permission catalog. web-source-never-imports-tests keeps those imports from reaching src.",
      severity: "error",
      from: { path: "^apps/web/(src|scripts)/" },
      to: {
        path: "^(apps/api/|packages/(api|db|integrations)/|packages/domain/src/(?!kernel/))",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "web-source-never-imports-tests",
      comment:
        "The web app's tests may reach the database and the domain (see web-reaches-the-api-over-http), so nothing " +
        "the app ships, or builds with, may import from apps/web/test.",
      severity: "error",
      from: { path: "^apps/web/(src|scripts)/" },
      to: { path: "^apps/web/test/" },
    },
    {
      name: "web-pages-skip-node-only-brand-files",
      comment:
        "@travel-crm/brand/files holds absolute file paths, built with Node's path module at import: it breaks in " +
        "a browser bundle. Only the web app's build scripts may use it.",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^packages/brand/src/assets\\.ts$" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment:
        "This dependency is part of a circular relationship. You might want to revise " +
        "your solution (i.e. use dependency inversion, make sure the modules have a single responsibility) ",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      comment:
        "This is an orphan module - it's likely not used (anymore?). Either use it or " +
        "remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
        "add an exception for it in your dependency-cruiser configuration. By default " +
        "this rule does not scrutinize dot-files (e.g. .eslintrc.js), TypeScript declaration " +
        "files (.d.ts), tsconfig.json and some of the babel and webpack configs.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$", // dot files
          "[.]d[.]ts$", // TypeScript declaration files
          "(^|/)tsconfig[.]json$", // TypeScript config
          "(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$", // other configs
          "(^|/)src/(index|platform)\\.ts$", // a package's public entry point is never imported inside the package
          "^apps/web/turbopack/", // Turbopack loaders, named in next.config.ts
          "^apps/web/src/app/", // Next.js loads the app's routes, layouts and special files by their names
          "^packages/integrations/test/spreadsheets/threads/", // the .xlsx thread's tests start these by their URL
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment:
        "A module depends on a node core module that has been deprecated. Find an alternative - these are " +
        "bound to exist - node doesn't deprecate lightly.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^v8/tools/codemap$",
          "^v8/tools/consarray$",
          "^v8/tools/csvparser$",
          "^v8/tools/logreader$",
          "^v8/tools/profile_view$",
          "^v8/tools/profile$",
          "^v8/tools/SourceMap$",
          "^v8/tools/splaytree$",
          "^v8/tools/tickprocessor-driver$",
          "^v8/tools/tickprocessor$",
          "^node-inspect/lib/_inspect$",
          "^node-inspect/lib/internal/inspect_client$",
          "^node-inspect/lib/internal/inspect_repl$",
          // async_hooks is left out: its AsyncLocalStorage is stable (soft-delete.ts uses it); only createHook is not.
          "^punycode$",
          "^domain$",
          "^constants$",
          "^sys$",
          "^_linklist$",
          "^_stream_wrap$",
        ],
      },
    },
    {
      name: "not-to-deprecated",
      comment:
        "This module uses a (version of an) npm module that has been deprecated. Either upgrade to a later " +
        "version of that module, or find an alternative. Deprecated modules are a security risk.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["deprecated"],
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment:
        "This module depends on an npm package that isn't in the 'dependencies' section of your package.json. " +
        "That's problematic as the package either (1) won't be available on live (2 - worse) will be " +
        "available on live with an non-guaranteed version. Fix it by adding the package to the dependencies " +
        "in your package.json.",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
      },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). If it's an npm " +
        "module: add it to your package.json. In all other cases you likely already know what to do.",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: "no-duplicate-dep-types",
      comment:
        "Likely this module depends on an external ('npm') package that occurs more than once " +
        "in your package.json i.e. bot as a devDependencies and in dependencies. This will cause " +
        "maintenance problems later on.",
      severity: "warn",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        // as it's common to use a devDependency for type-only imports: don't
        // consider type-only dependencyTypes for this rule
        dependencyTypesNot: ["type-only"],
      },
    },

    // rules you might want to tweak for your specific situation:

    {
      name: "not-to-spec",
      comment:
        "This module depends on a spec (test) file. The responsibility of a spec file is to test code. " +
        "If there's something in a spec that's of use to other modules, it doesn't have that single " +
        "responsibility anymore. Factor it out into (e.g.) a separate utility/ helper or a mock.",
      severity: "error",
      from: {},
      to: {
        path: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "This module depends on an npm package from the 'devDependencies' section of your " +
        "package.json. It looks like something that ships to production, though. To prevent problems " +
        "with npm packages that aren't there on production declare it (only!) in the 'dependencies'" +
        "section of your package.json. If this module is development only - add it to the " +
        "from.pathNot re of the not-to-dev-dep rule in the dependency-cruiser configuration",
      from: {
        path: "^(apps|packages)/[^/]+/(src|app)/",
        pathNot: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
      to: {
        dependencyTypes: ["npm-dev"],
        // type only dependencies are not a problem as they don't end up in the
        // production code or are ignored by the runtime.
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "optional-deps-used",
      severity: "info",
      comment:
        "This module depends on an npm package that is declared as an optional dependency " +
        "in your package.json. As this makes sense in limited situations only, it's flagged here. " +
        "If you use an optional dependency here by design - add an exception to your" +
        "dependency-cruiser configuration.",
      from: {},
      to: {
        dependencyTypes: ["npm-optional"],
      },
    },
    {
      name: "peer-deps-used",
      comment:
        "This module depends on an npm package that is declared as a peer dependency " +
        "in your package.json. This makes sense if your package is e.g. a plugin, but in " +
        "other cases - maybe not so much. If the use of a peer dependency is intentional " +
        "add an exception to your dependency-cruiser configuration.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["npm-peer"],
      },
    },
  ],
  options: {
    // Which modules not to follow further when encountered
    doNotFollow: {
      // path: an array of regular expressions in strings to match against
      // Generated code is not followed (its internals are noise) but stays in the graph, so rules can see
      // imports of it. Listing it under `exclude` instead would hide those imports from every rule.
      path: ["node_modules", "(^|/)src/generated/"],
    },

    // Which modules to exclude
    // The web app's public/ holds files served as they are (icons, the bundled service worker), never imported. A
    // package's own dist/ holds build output (the api's bundle for its image), which imports what only the image
    // installs; node_modules' dist folders stay, so the rules still see what each package imports.
    exclude: { path: "(^|/)\\.next/|^(apps|packages)/[^/]+/dist/|next-env\\.d\\.ts$|^apps/web/public/" },

    // Which modules to exclusively include (array of regular expressions in strings)
    // dependency-cruiser will skip everything that doesn't match this pattern
    // includeOnly : [''],

    // List of module systems to cruise.
    // When left out dependency-cruiser will fall back to the list of _all_
    // module systems it knows of ('amd', 'cjs', 'es6', 'tsd']). It's the
    // default because it's the safe option. It comes at a performance penalty, though
    // As in practice only commonjs ('cjs') and ecmascript modules ('es6')
    // are in wide use, you can limit the moduleSystems to those.
    // moduleSystems: ['cjs', 'es6'],

    // false: don't look at JSDoc imports (the default)
    // true: detect dependencies in JSDoc-style import statements.
    // Implies parser: 'tsc', which a.o. means the typescript compiler will need
    // to be installed in the same spot you run dependency-cruiser from.
    // detectJSDocImports: true,

    // false: don't look at imports in ambient module declarations (the default)
    // true: detect imports, re-exports and import-equals declarations inside
    // ambient modules and namespaces. Implies parser: 'tsc'.
    // detectImportsInAmbientModules: true,

    // false: don't look at process.getBuiltinModule calls (the default)
    // true: dependency-cruiser will detect calls to process.getBuiltinModule/
    // globalThis.process.getBuiltinModule as imports.
    detectProcessBuiltinModuleCalls: true,

    // prefix for links in html, d2, mermaid and dot/ svg output (e.g. 'https://github.com/you/yourrepo/blob/main/'
    // to open it on your online repo or `vscode://file/${process.cwd()}/` to
    // open it in visual studio code),
    // prefix: `vscode://file/${process.cwd()}/`,

    // suffix for links in output. E.g. put .html here if you use it to link to
    // your coverage reports.
    // suffix: '.html',

    // false (the default): ignore dependencies that only exist before typescript-to-javascript compilation
    // true: also detect dependencies that only exist before typescript-to-javascript compilation
    // 'specify': for each dependency identify whether it only exists before compilation or also after
    tsPreCompilationDeps: true,

    // list of extensions to scan that aren't javascript or compile-to-javascript.
    // Empty by default. Only put extensions in here that you want to take into
    // account that are _not_ parsable.
    // extraExtensionsToScan: ['.json', '.jpg', '.png', '.svg', '.webp'],

    // if true combines the package.jsons found from the module up to the base
    // folder the cruise is initiated from. Useful for how (some) mono-repos
    // manage dependencies & dependency definitions.
    // combinedDependencies: false,

    // if true leave symlinks untouched, otherwise use the realpath
    // preserveSymlinks: false,

    // TypeScript project file ('tsconfig.json') to use for
    // (1) compilation and
    // (2) resolution (e.g. with the paths property)
    //
    // The (optional) fileName attribute specifies which file to take (relative to
    // dependency-cruiser's current working directory). When not provided
    // defaults to './tsconfig.json'.
    // tsConfig: {
    //   fileName: 'tsconfig.json'
    // },

    // Webpack configuration to use to get resolve options from.
    //
    // The (optional) fileName attribute specifies which file to take (relative
    // to dependency-cruiser's current working directory. When not provided defaults
    // to './webpack.conf.js'.
    //
    // The (optional) 'env' and 'arguments' attributes contain the parameters
    // to be passed if your webpack config is a function and takes them (see
    //  webpack documentation for details)
    // Only for its resolve.alias: the web app's "@/..." imports (apps/web/src), as its tsconfig's paths say.
    webpackConfig: {
      fileName: "apps/web/depcruise-aliases.cjs",
    },

    // Babel config ('.babelrc', '.babelrc.json', '.babelrc.json5', ...) to use
    // for compilation
    // babelConfig: {
    //   fileName: '.babelrc',
    // },

    // List of strings you have in use in addition to cjs/ es6 requires
    // & imports to declare module dependencies. Use this e.g. if you've
    // re-declared require, use a require-wrapper or use window.require as
    // a hack.
    // exoticRequireStrings: [],

    // options to pass on to enhanced-resolve, the package dependency-cruiser
    // uses to resolve module references to disk. The values below should be
    // suitable for most situations
    //
    // If you use webpack: you can also set these in webpack.conf.js. The set
    // there will override the ones specified here.
    enhancedResolveOptions: {
      // What to consider as an 'exports' field in package.jsons
      exportsFields: ["exports"],

      // List of conditions to check for in the exports field.
      // Only works when the 'exportsFields' array is non-empty.
      conditionNames: ["import", "require", "node", "default", "types"],

      // The extensions, by default are the same as the ones dependency-cruiser
      // can access (run `npx dependency-cruiser --info` to see which ones that are in
      // _your_ environment). If that list is larger than you need you can pass
      // the extensions you actually use (e.g. ['.js', '.jsx']). This can speed
      // up module resolution, which is the most expensive step.
      extensions: [".ts", ".tsx", ".d.ts", ".js"],

      // What to consider a 'main' field in package.json
      mainFields: ["module", "main", "types", "typings"],

      // A list of alias fields in package.jsons
      // See https://github.com/defunctzombie/package-browser-field-spec and
      // the webpack [resolve.alias](https://webpack.js.org/configuration/resolve/#resolvealiasfields)
      // documentation.
      // Defaults to an empty array (= don't use alias fields).
      // aliasFields: ['browser'],
    },

    // skipAnalysisNotInRules will make dependency-cruiser execute
    // analysis strictly necessary for checking the rule set only.
    // See https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#skipanalysisnotinrules
    skipAnalysisNotInRules: true,

    reporterOptions: {
      dot: {
        // Pattern of modules to consolidate to. The default pattern in this configuration
        // collapses everything in node_modules to one folder deep so you see
        // the external modules, but not their innards.
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)",

        // Options to tweak the appearance of your graph. See
        // https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#reporteroptions
        // If you don't specify a theme dependency-cruiser falls back to a built-in one.
        // theme: {
        //   graph: {
        //     // splines: 'ortho' - straight lines; slow on big graphs
        //     // splines: 'true' - bezier curves; fast but not as nice as ortho
        //     splines: 'true'
        //   },
        // },
      },
      archi: {
        // Pattern of modules to consolidate to.
        collapsePattern:
          "^(?:packages|src|lib(s?)|app(s?)|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)",

        // Options to tweak the appearance of your graph. If you don't specify a
        // theme for 'archi' dependency-cruiser will use the one specified in the
        // dot section above and otherwise use the default one.
        // theme: { },
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
// generated: dependency-cruiser@18.6.0 on 2026-10-14T07:43:27.388Z
