import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'

type WarmVisibleHelpsResource = {
  typeId: string
  resourceKey: string
  role: 'scripture' | 'helps'
  helpsType?: 'notes' | 'words-links'
}

export function warmVisibleHelpsResources(args: {
  targetSourceId?: string | null
  tnKey: string
  twlKey: string
}): WarmVisibleHelpsResource[] {
  const rows: WarmVisibleHelpsResource[] = []
  if (args.targetSourceId) {
    rows.push({
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey: args.targetSourceId,
      role: 'scripture',
    })
  }
  if (args.tnKey) {
    rows.push({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
      resourceKey: args.tnKey,
      role: 'helps',
      helpsType: 'notes',
    })
  }
  if (args.twlKey) {
    rows.push({
      typeId: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
      resourceKey: args.twlKey,
      role: 'helps',
      helpsType: 'words-links',
    })
  }
  return rows
}
