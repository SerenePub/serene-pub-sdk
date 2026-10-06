/**
 * The built-in writes, one spec per file; what they share — the version, the
 * SDK's ids and the one-node builder — is `builtIn.ts`'s.
 */
export { BUILTIN_VERSION, BUILTIN_SPEC_IDS, type BuiltInKind } from './builtIn.js'
export * from './delete.js'
export * from './hide.js'
export * from './edit.js'
export * from './swipe.js'
export * from './branch.js'
