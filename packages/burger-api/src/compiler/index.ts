/**
 * Compiler module for BurgerAPI — the build-time / dev-time route pipeline.
 *
 * Filesystem scanning (convention files), module loading, and the structural
 * route tree. Used by the CLI build pipeline and dev mode; production AOT
 * apps consume prebuilt `apiRoutes` instead.
 */

export { DirectoryScanner } from './scanner';
export { ModuleLoader } from './module-loader';
export { RouteTree } from './route-tree';
export type {
    RouteModule,
    ScannedRoute,
    ScanResult,
} from './route-module';
export {
    CONVENTION_FILES,
    CONVENTION_EXTENSIONS,
    FORBIDDEN_FILES,
    splitConventionName,
    isConventionFile,
    assertConventionFile,
} from './conventions';
export type { ConventionFile } from './conventions';
