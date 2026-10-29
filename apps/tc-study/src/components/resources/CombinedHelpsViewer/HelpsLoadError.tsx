import { CloudOff } from 'lucide-react'
import { helpsLoadErrorView } from './helpsLoadErrorView'

const NOT_ON_DEVICE = 'Not on this device: open its language pack, or connect to download it'

/** One helps resource's load error: a quiet "not on this device" with no network, the message otherwise. */
export function HelpsLoadError({ message }: { message: string }) {
  const view = helpsLoadErrorView(message)
  if (view.kind === 'not-on-device') {
    return (
      <p className="flex justify-center mb-stack text-fg-muted" role="status" aria-label={NOT_ON_DEVICE} title={NOT_ON_DEVICE} data-testid="helps-not-on-device">
        <CloudOff className="w-6 h-6" />
      </p>
    )
  }
  return <p className="text-chrome text-danger mb-stack">{view.message}</p>
}
