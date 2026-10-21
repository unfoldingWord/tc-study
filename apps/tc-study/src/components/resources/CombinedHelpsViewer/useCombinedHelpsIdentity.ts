/**
 * CombinedHelps resource identity: language, scope, and TN/TWL keys.
 */

import type { ResourceInfo } from '../../../contexts/types'
import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'
import { primaryLangCode, resolveHelpsViewerScope } from './combinedHelpsUtils'
import { useCombinedHelpsResources } from './useCombinedHelpsResources'

export function useCombinedHelpsIdentity(args: {
  resourceId: string
  resourceKey: string
  resource: ResourceInfo
  resourceFromStore: ResourceInfo | undefined
  packageResources?: Map<string, ResourceInfo>
  loadedResources: Record<string, ResourceInfo | undefined>
}) {
  const { resourceId, resourceKey, resource, resourceFromStore, packageResources, loadedResources } = args
  const workspaceHelps = packageResources?.get(resource?.id || resource?.key || '')
  const effectiveResource = workspaceHelps ?? resourceFromStore ?? resource
  const wantLang = primaryLangCode(
    effectiveResource.language ||
      effectiveResource.languageCode ||
      resource.language ||
      resource.languageCode ||
      ''
  )
  const helpsScope: 'scripture' | 'obs' = resolveHelpsViewerScope({
    resourceId,
    resourceKey,
    type: effectiveResource.type,
    appliesToScope: effectiveResource.appliesToScope,
  })
  const consumed = workspaceHelps?.consumedKeys ?? effectiveResource.consumedKeys
  const notesType =
    helpsScope === 'obs' ? RESOURCE_TYPE_IDS.OBS_NOTES : RESOURCE_TYPE_IDS.TRANSLATION_NOTES
  const twlType =
    helpsScope === 'obs'
      ? RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
      : RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS
  const { tnKey, twlKey } = useCombinedHelpsResources({
    loadedResources,
    packageResources,
    wantLang,
    injectedTnKey:
      workspaceHelps?.helpsTnResourceKey ??
      effectiveResource.helpsTnResourceKey ??
      consumed?.[notesType],
    injectedTwlKey:
      workspaceHelps?.helpsTwlResourceKey ??
      effectiveResource.helpsTwlResourceKey ??
      consumed?.[twlType],
    helpsScope,
  })
  return { effectiveResource, wantLang, helpsScope, tnKey, twlKey }
}
