import {
  Book,
  BookText,
  FileText,
  GraduationCap,
  HelpCircle,
  Link as LinkIcon,
  Package,
} from 'lucide-react';
import { getResourceBadgeLabel } from '../../../features/tabs/tabShortLabel';

export function getResourceIcon(type: string, subject?: string) {
  const subjectLower = subject?.toLowerCase() || '';
  const typeLower = type.toLowerCase();

  if (subjectLower.includes('bible') || typeLower.includes('scripture')) {
    return Book;
  }
  if (subjectLower.includes('words') || typeLower.includes('words')) {
    return BookText;
  }
  if (subjectLower.includes('notes') || typeLower.includes('notes')) {
    return FileText;
  }
  if (subjectLower.includes('questions') || typeLower.includes('questions')) {
    return HelpCircle;
  }
  if (subjectLower.includes('academy') || typeLower.includes('academy')) {
    return GraduationCap;
  }
  if (typeLower.includes('link')) {
    return LinkIcon;
  }
  return Package;
}

export function getResourceId(
  key: string,
  resource?: { abbreviation?: string; title?: string; type?: string },
): string {
  return getResourceBadgeLabel(key, resource);
}

export function getLanguageName(
  languageName: string | undefined,
  languageCode: string | undefined,
  availableLanguages: Array<{ code: string; name: string }>,
): string {
  if (languageName) return languageName;
  if (!languageCode) return 'Unknown';

  const lang = availableLanguages.find(
    (l) => l.code.toLowerCase() === languageCode.toLowerCase(),
  );
  if (lang) return lang.name;

  return languageCode.toUpperCase();
}
