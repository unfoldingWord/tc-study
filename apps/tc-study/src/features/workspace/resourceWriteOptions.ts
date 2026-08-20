import { projectPanelsFromPackage } from './workspaceProjection'

/** Catalog hydrate / mode-switch membership batch — ensure + persist once after the loop. */
export interface ResourceWriteOptions {
  skipEnsure?: boolean
  skipPersist?: boolean
}

export const CATALOG_HYDRATE_BATCH: ResourceWriteOptions = {
  skipEnsure: true,
  skipPersist: true,
}

/** skipEnsure also skips project so TN/TWL are not painted before the batched apply. */
export function finishResourceWrite(
  get: () => { autoSaveWorkspace: () => void; currentPackage: Parameters<typeof projectPanelsFromPackage>[0] },
  options?: ResourceWriteOptions
): void {
  if (!options?.skipEnsure) projectPanelsFromPackage(get().currentPackage)
  if (!options?.skipPersist) get().autoSaveWorkspace()
}
