/**
 * Scripture Navigator for BT Studio - React Native Version
 * 
 * Two separate dropdowns:
 * 1. Book selection dropdown
 * 2. Chapter/Verse navigation dropdown with range selection and sections
 * Preserves all original features in React Native format.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import {
    PassageSet
} from '../../types/passage-sets';

interface ScriptureNavigatorProps {
  className?: string;
}

export default function ScriptureNavigator({ className }: ScriptureNavigatorProps) {
  const { currentReference, navigateToReference, isLoading } = useNavigation();
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [isPassageSetDropdownOpen, setIsPassageSetDropdownOpen] = useState(false);
  const [passageSets, setPassageSets] = useState<PassageSet[]>([]);
  const [loadingPassageSets, setLoadingPassageSets] = useState(false);
  const [passageSetError, setPassageSetError] = useState<string | null>(null);
  const [selectedPassageSet, setSelectedPassageSet] = useState<PassageSet | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Bible books data
  const bibleBooks = [
    { code: 'gen', name: 'Genesis', chapters: 50 },
    { code: 'exo', name: 'Exodus', chapters: 40 },
    { code: 'lev', name: 'Leviticus', chapters: 27 },
    { code: 'num', name: 'Numbers', chapters: 36 },
    { code: 'deu', name: 'Deuteronomy', chapters: 34 },
    { code: 'jos', name: 'Joshua', chapters: 24 },
    { code: 'jdg', name: 'Judges', chapters: 21 },
    { code: 'rut', name: 'Ruth', chapters: 4 },
    { code: '1sa', name: '1 Samuel', chapters: 31 },
    { code: '2sa', name: '2 Samuel', chapters: 24 },
    { code: '1ki', name: '1 Kings', chapters: 22 },
    { code: '2ki', name: '2 Kings', chapters: 25 },
    { code: '1ch', name: '1 Chronicles', chapters: 29 },
    { code: '2ch', name: '2 Chronicles', chapters: 36 },
    { code: 'ezr', name: 'Ezra', chapters: 10 },
    { code: 'neh', name: 'Nehemiah', chapters: 13 },
    { code: 'est', name: 'Esther', chapters: 10 },
    { code: 'job', name: 'Job', chapters: 42 },
    { code: 'psa', name: 'Psalms', chapters: 150 },
    { code: 'pro', name: 'Proverbs', chapters: 31 },
    { code: 'ecc', name: 'Ecclesiastes', chapters: 12 },
    { code: 'sng', name: 'Song of Songs', chapters: 8 },
    { code: 'isa', name: 'Isaiah', chapters: 66 },
    { code: 'jer', name: 'Jeremiah', chapters: 52 },
    { code: 'lam', name: 'Lamentations', chapters: 5 },
    { code: 'ezk', name: 'Ezekiel', chapters: 48 },
    { code: 'dan', name: 'Daniel', chapters: 12 },
    { code: 'hos', name: 'Hosea', chapters: 14 },
    { code: 'jol', name: 'Joel', chapters: 3 },
    { code: 'amo', name: 'Amos', chapters: 9 },
    { code: 'oba', name: 'Obadiah', chapters: 1 },
    { code: 'jon', name: 'Jonah', chapters: 4 },
    { code: 'mic', name: 'Micah', chapters: 7 },
    { code: 'nam', name: 'Nahum', chapters: 3 },
    { code: 'hab', name: 'Habakkuk', chapters: 3 },
    { code: 'zep', name: 'Zephaniah', chapters: 3 },
    { code: 'hag', name: 'Haggai', chapters: 2 },
    { code: 'zec', name: 'Zechariah', chapters: 14 },
    { code: 'mal', name: 'Malachi', chapters: 4 },
    { code: 'mat', name: 'Matthew', chapters: 28 },
    { code: 'mrk', name: 'Mark', chapters: 16 },
    { code: 'luk', name: 'Luke', chapters: 24 },
    { code: 'jhn', name: 'John', chapters: 21 },
    { code: 'act', name: 'Acts', chapters: 28 },
    { code: 'rom', name: 'Romans', chapters: 16 },
    { code: '1co', name: '1 Corinthians', chapters: 16 },
    { code: '2co', name: '2 Corinthians', chapters: 13 },
    { code: 'gal', name: 'Galatians', chapters: 6 },
    { code: 'eph', name: 'Ephesians', chapters: 6 },
    { code: 'php', name: 'Philippians', chapters: 4 },
    { code: 'col', name: 'Colossians', chapters: 4 },
    { code: '1th', name: '1 Thessalonians', chapters: 5 },
    { code: '2th', name: '2 Thessalonians', chapters: 3 },
    { code: '1ti', name: '1 Timothy', chapters: 6 },
    { code: '2ti', name: '2 Timothy', chapters: 4 },
    { code: 'tit', name: 'Titus', chapters: 3 },
    { code: 'phm', name: 'Philemon', chapters: 1 },
    { code: 'heb', name: 'Hebrews', chapters: 13 },
    { code: 'jas', name: 'James', chapters: 5 },
    { code: '1pe', name: '1 Peter', chapters: 5 },
    { code: '2pe', name: '2 Peter', chapters: 3 },
    { code: '1jn', name: '1 John', chapters: 5 },
    { code: '2jn', name: '2 John', chapters: 1 },
    { code: '3jn', name: '3 John', chapters: 1 },
    { code: 'jud', name: 'Jude', chapters: 1 },
    { code: 'rev', name: 'Revelation', chapters: 22 }
  ];

  // Get current book info
  const currentBook = bibleBooks.find(book => book.code === currentReference.book);
  const currentBookName = currentBook?.name || currentReference.book;
  const currentChapterCount = currentBook?.chapters || 1;

  // Format reference display
  const formatReferenceOnly = () => {
    if (currentReference.chapter && currentReference.verse) {
      return `${currentReference.chapter}:${currentReference.verse}`;
    } else if (currentReference.chapter) {
      return `${currentReference.chapter}`;
    }
    return '';
  };

  const formatFullReference = () => {
    return `${currentBookName} ${formatReferenceOnly()}`;
  };

  // Handle book selection
  const handleBookSelect = (bookCode: string) => {
    navigateToReference({
      book: bookCode,
      chapter: 1,
      verse: 1
    });
    setIsBookDropdownOpen(false);
  };

  // Handle chapter selection
  const handleChapterSelect = (chapter: number) => {
    navigateToReference({
      book: currentReference.book,
      chapter,
      verse: 1
    });
    setIsChapterDropdownOpen(false);
  };

  // Handle verse selection
  const handleVerseSelect = (verse: number) => {
    navigateToReference({
      book: currentReference.book,
      chapter: currentReference.chapter || 1,
      verse
    });
    setIsChapterDropdownOpen(false);
  };

  // Load passage sets
  useEffect(() => {
    const loadPassageSets = async () => {
      setLoadingPassageSets(true);
      setPassageSetError(null);
      
      try {
        // Mock passage sets - in real implementation, this would fetch from API
        const mockPassageSets: PassageSet[] = [
          {
            id: 'nt-gospels',
            name: 'New Testament Gospels',
            description: 'All four Gospel accounts',
            passages: [
              { book: 'mat', chapter: 1, verse: 1 },
              { book: 'mrk', chapter: 1, verse: 1 },
              { book: 'luk', chapter: 1, verse: 1 },
              { book: 'jhn', chapter: 1, verse: 1 }
            ],
            metadata: {
              passageCount: 4,
              totalTime: 120,
              difficulty: 'beginner'
            }
          }
        ];
        
        setPassageSets(mockPassageSets);
    } catch (error) {
        console.error('Failed to load passage sets:', error);
        setPassageSetError(error instanceof Error ? error.message : 'Failed to load passage sets');
      } finally {
        setLoadingPassageSets(false);
      }
    };

    loadPassageSets();
  }, []);

  // Filter books based on search
  const filteredBooks = bibleBooks.filter(book =>
    book.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Generate verse count for current chapter (mock data)
  const verseCountByChapter: Record<number, number> = {};
  for (let i = 1; i <= currentChapterCount; i++) {
    verseCountByChapter[i] = Math.floor(Math.random() * 30) + 20; // Mock verse count
  }

  return (
    <View style={[styles.container, className && { className }]}>
      {/* Book Selection Dropdown */}
      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setIsBookDropdownOpen(!isBookDropdownOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {currentBookName}
          </Text>
          <Text style={styles.dropdownIcon}>▼</Text>
        </Pressable>

        {isBookDropdownOpen && (
        <Modal
            visible={isBookDropdownOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsBookDropdownOpen(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Book</Text>
                  <Pressable
                    onPress={() => setIsBookDropdownOpen(false)}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.bookList}>
                  {filteredBooks.map((book) => (
                    <Pressable
                      key={book.code}
                      style={styles.bookItem}
                      onPress={() => handleBookSelect(book.code)}
                    >
                      <Text style={styles.bookName}>{book.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
        </Modal>
      )}
      </View>

      {/* Chapter/Verse Selection Dropdown */}
      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setIsChapterDropdownOpen(!isChapterDropdownOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {formatReferenceOnly()}
          </Text>
          {isLoading ? (
            <Text style={styles.loadingSpinner}>⟳</Text>
          ) : (
            <Text style={styles.dropdownIcon}>▼</Text>
          )}
        </Pressable>

        {isChapterDropdownOpen && (
          <Modal
            visible={isChapterDropdownOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsChapterDropdownOpen(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Chapter & Verse</Text>
                  <Pressable
                    onPress={() => setIsChapterDropdownOpen(false)}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.chapterList}>
                  {Array.from({ length: currentChapterCount }, (_, i) => i + 1).map((chapter) => {
          const verseCount = verseCountByChapter[chapter] || 31;
          return (
                      <View key={chapter} style={styles.chapterGroup}>
                        <Text style={styles.chapterHeader}>
                  {chapter}
                        </Text>
                        <View style={styles.verseGrid}>
                {Array.from({ length: verseCount }, (_, i) => i + 1).map((verse) => {
                  const isSelected = 
                              currentReference.chapter === chapter && 
                              currentReference.verse === verse;
                  
                  return (
                              <Pressable
                      key={verse}
                                style={[
                                  styles.verseButton,
                                  isSelected && styles.verseButtonSelected
                                ]}
                                onPress={() => handleVerseSelect(verse)}
                              >
                                <Text style={[
                                  styles.verseButtonText,
                                  isSelected && styles.verseButtonTextSelected
                                ]}>
                      {verse}
                                </Text>
                              </Pressable>
                  );
                })}
                        </View>
                      </View>
          );
        })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>

      {/* Passage Sets Dropdown */}
      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setIsPassageSetDropdownOpen(!isPassageSetDropdownOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {selectedPassageSet?.name || 'Passage Sets'}
          </Text>
          <Text style={styles.dropdownIcon}>▼</Text>
        </Pressable>

        {isPassageSetDropdownOpen && (
          <Modal
            visible={isPassageSetDropdownOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsPassageSetDropdownOpen(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Passage Set</Text>
                  <Pressable
                    onPress={() => setIsPassageSetDropdownOpen(false)}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.passageSetList}>
                  {loadingPassageSets ? (
                    <View style={styles.loadingContainer}>
                      <Text style={styles.loadingSpinner}>⟳</Text>
                      <Text style={styles.loadingText}>Loading passage sets...</Text>
                    </View>
                  ) : passageSetError ? (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>Failed to load passage sets</Text>
                      <Text style={styles.errorMessage}>{passageSetError}</Text>
                    </View>
                  ) : (
                    passageSets.map((passageSet) => (
                      <Pressable
                        key={passageSet.id}
                        style={styles.passageSetItem}
                        onPress={() => {
                          setSelectedPassageSet(passageSet);
                          setIsPassageSetDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.passageSetName}>{passageSet.name}</Text>
                        <Text style={styles.passageSetDescription}>{passageSet.description}</Text>
                        <View style={styles.passageSetMetadata}>
                          <Text style={styles.passageSetMetaText}>
                            {passageSet.metadata.passageCount} passages
                          </Text>
                          <Text style={styles.passageSetMetaText}>
                            ~{passageSet.metadata.totalTime}min total
                          </Text>
                        </View>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  dropdownContainer: {
    position: 'relative',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    minWidth: 120,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  loadingSpinner: {
    fontSize: 16,
    color: '#3b82f6',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: '90%',
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
    borderRadius: 6,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  bookList: {
    maxHeight: 300,
  },
  bookItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  bookName: {
    fontSize: 14,
    color: '#374151',
  },
  chapterList: {
    maxHeight: 400,
  },
  chapterGroup: {
    marginBottom: 16,
  },
  chapterHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  verseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  verseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 32,
    alignItems: 'center',
  },
  verseButtonSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  verseButtonText: {
    fontSize: 12,
    color: '#374151',
  },
  verseButtonTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  passageSetList: {
    maxHeight: 300,
  },
  passageSetItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  passageSetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  passageSetDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  passageSetMetadata: {
    flexDirection: 'row',
    gap: 16,
  },
  passageSetMetaText: {
    fontSize: 12,
    color: '#3b82f6',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#dc2626',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
  },
});
