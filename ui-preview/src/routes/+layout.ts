/**
 * Client-only, by contract rather than convenience: plugin surfaces mount
 * after hydration (10 §9), and a harness that server-rendered them would be
 * showing a first paint the product never produces.
 */
export const ssr = false
export const prerender = false
