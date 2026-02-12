import { useParams } from 'react-router-dom'

export function Reader() {
  const { packageId } = useParams<{ packageId: string }>()
  return <div>Reader: {packageId}</div>
}
