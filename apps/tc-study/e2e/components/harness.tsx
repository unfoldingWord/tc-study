/**
 * A page that renders the base components no screen uses yet, so a browser can drive their focus
 * and keys. Bundled by base-components.spec.ts; never part of the app build.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog } from '../../src/components/ui/Dialog'
import { Switcher, type SwitcherItem } from '../../src/components/ui/Switcher'

type View = 'read' | 'study' | 'notes'

const VIEWS: SwitcherItem<View>[] = [
  { value: 'read', label: 'Read' },
  { value: 'study', label: 'Study' },
  { value: 'notes', label: 'Notes' },
]

function ControlledSwitcher({ label, dir }: { label: string; dir?: 'ltr' | 'rtl' }) {
  const [view, setView] = useState<View>('read')
  return <Switcher<View> items={VIEWS} value={view} onChange={setView} label={label} dir={dir} />
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Harness dialog" closeLabel="Close">
        Body
      </Dialog>
      <ControlledSwitcher label="View" />
      <ControlledSwitcher label="View rtl" dir="rtl" />
    </>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Harness />)
