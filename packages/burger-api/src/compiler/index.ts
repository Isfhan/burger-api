/**
 * Compiler module for BurgerAPI — the build-time / dev-time route pipeline.
 *
 * Filesystem scanning (convention files), module loading, and the structural
 * route tree. Used by the CLI build pipeline and dev mode; production AOT
 * apps consume prebuilt `apiRoutes` instead.
 */

export { DirectoryScanner } from './scanner.js';
export { ModuleLoader } from './module-loader.js';
export { RouteTree } from './route-tree.js';
export type {
    RouteModule,
    ScannedRoute,
    ScanResult,
} from './route-module.js';
export {
    CONVENTION_FILES,
    CONVENTION_EXTENSIONS,
    FORBIDDEN_FILES,
    splitConventionName,
    isConventionFile,
    assertConventionFile,
} from './conventions.js';
export type { ConventionFile } from './conventions.js';
