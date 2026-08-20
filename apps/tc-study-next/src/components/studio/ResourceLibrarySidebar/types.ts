export interface ResourceLibrarySidebarProps {
  onResourceDragStart?: (resourceKeys: string[]) => void;
  onResourceDragEnd?: () => void;
  onResourceSelect?: (resourceKey: string | null) => void;
  onSelectedResourcesChange?: (resourceKeys: string[]) => void;
  selectedResourceKey?: string | null;
  selectedResourceKeys?: string[];
  showWizard?: boolean;
  onShowWizardChange?: (show: boolean) => void;
  activeCollection?: { title?: string; name?: string };
}

export interface ResourceItem {
  id: string;
  key: string;
  title: string;
  type: string;
  /** DCS catalog abbreviation when it differs from the key segment (e.g. tpl for glt). */
  abbreviation?: string;
  subject?: string;
  language: string;
  languageCode: string;
  languageName?: string;
  owner?: string;
}

export interface SidebarDisplayMode {
  isExpanded: boolean;
  isMedium: boolean;
  isCompact: boolean;
  isMinimal: boolean;
}
