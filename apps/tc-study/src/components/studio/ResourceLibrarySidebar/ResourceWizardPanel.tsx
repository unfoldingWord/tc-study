import { AddToCatalogWizard } from '../../catalog/AddToCatalogWizard';

export function ResourceWizardPanel({
  show,
  onClose,
  targetPanel = null,
}: {
  show: boolean;
  onClose: () => void;
  targetPanel?: 'panel-1' | 'panel-2' | null;
}) {
  if (!show) return null;

  return (
    <AddToCatalogWizard
      onClose={onClose}
      onComplete={onClose}
      isEmbedded={false}
      targetPanel={targetPanel}
    />
  );
}
