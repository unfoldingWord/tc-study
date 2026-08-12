import { Info } from 'lucide-react'
import { useState } from 'react'
import type { ResourceInfo } from '../../../contexts/types'
import { ResourceInfoModal } from '../../studio/ResourceInfoModal'
import { chromeIconButtonClass } from './chromeIconButton'
import { useEnrichedResourceInfoModal } from './useEnrichedResourceInfoModal'

interface ResourceInfoButtonProps {
  resource: ResourceInfo
}

/**
 * Chrome Info control for ResourceViewerHeader — opens ResourceInfoModal
 * for the current single resource (scripture, TN/TWL/TQ standalone, OBS, etc.).
 * Chrome opens immediately; README is hydrated async when missing.
 */
export function ResourceInfoButton({ resource }: ResourceInfoButtonProps) {
  const [open, setOpen] = useState(false)
  const { modalResource, loadingBody } = useEnrichedResourceInfoModal(open ? resource : null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Resource info"
        aria-label="Resource info"
        aria-pressed={open}
        className={chromeIconButtonClass(open)}
      >
        <Info className="w-4 h-4" aria-hidden />
      </button>
      {modalResource ? (
        <ResourceInfoModal
          isOpen={open}
          onClose={() => setOpen(false)}
          resource={modalResource}
          loadingBody={loadingBody}
        />
      ) : null}
    </>
  )
}
