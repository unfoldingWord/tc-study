/**
 * Registry viewers accept looser panel props than ResourceViewerProps, and
 * app vs package @types/react copies disagree on ComponentType/ReactNode.
 * Soften only at the plugin boundary (return is intentionally `any`).
 */
 
export function asResourceViewer(viewer: unknown): any {
  return viewer
}
