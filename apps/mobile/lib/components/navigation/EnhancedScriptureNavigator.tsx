/**
 * Enhanced Scripture Navigator for BT Synergy
 * 
 * This navigator depends on anchor resource metadata and content loading,
 * similar to the bt-studio implementation. It provides:
 * 1. Book selection based on anchor resource available books
 * 2. Chapter/Verse navigation with actual content-based counts
 * 3. Section navigation from USFM content
 * 4. Loading states that wait for anchor resource
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigationSelector } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import newGenerationsStorySets from '../../data/passage-sets/new-generations-story-sets.json';
import { TranslatorSection } from '../../types/context';
import { Passage, PassageSet } from '../../types/passage-sets';
import { loadPassageSetFromObject, parsePassageString } from '../../utils/passage-sets';
import { Icon } from '../ui/Icon.native';
import { PassageSetSelector } from './PassageSetSelector';

interface VerseRange {
  startChapter: number;
  startVerse: number;
  endChapter?: number;
  endVerse?: number;
}

interface Section {
  title: string;
  range: VerseRange;
}

interface BookInfo {
  code: string;
  name: string;
  testament?: string;
}

// Individual selectors to prevent unnecessary re-renders
const selectCurrentReference = (state: any) => state.currentReference;
const selectNavigateToBook = (state: any) => state.navigateToBook;
const selectNavigateToReference = (state: any) => state.navigateToReference;

export function EnhancedScriptureNavigator() {
  // Use individual selectors to prevent object recreation and unnecessary re-renders
  const currentReference = useNavigationSelector(selectCurrentReference);
  const navigateToBook = useNavigationSelector(selectNavigateToBook);
  const navigateToReference = useNavigationSelector(selectNavigateToReference);

  // Get anchor resource and workspace state
  const anchorResource = useWorkspaceSelector(state => state.anchorResource);
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const appReady = useWorkspaceSelector(state => state.appReady);

  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [bookModalTab, setBookModalTab] = useState<'books' | 'passages'>('books');
  const [navTab, setNavTab] = useState<'range' | 'sections'>('range');
  const [chapterCount, setChapterCount] = useState<number>(1);
  const [verseCountByChapter, setVerseCountByChapter] = useState<Record<number, number>>({});
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [passageSet, setPassageSet] = useState<PassageSet | null>(null);
  const [passageSetError, setPassageSetError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const previousReferenceRef = useRef(currentReference);

  // Debug logging for isNavigating state changes
  useEffect(() => {
    
  }, [isNavigating]);

  // Extract available books from anchor resource metadata
  const availableBooks = useMemo((): BookInfo[] => {
    if (!anchorResource?.toc?.books) {
      // Fallback to minimal book list if no anchor resource
      return [
        { code: 'tit', name: 'Titus', testament: 'NT' }
      ];
    }

    return anchorResource.toc.books.map(book => ({
      code: book.code,
      name: book.name || book.code.toUpperCase(),
      testament: book.testament
    }));
  }, [anchorResource]);

  // Get current book info (for potential future use)
  // const currentBookInfo = useMemo(() => {
  //   return availableBooks.find(book => book.code === currentReference.book);
  // }, [availableBooks, currentReference.book]);

  // Load passage set data on component mount
  useEffect(() => {
    const loadPassageSet = () => {
      try {
        const loadedPassageSet = loadPassageSetFromObject(newGenerationsStorySets);
        setPassageSet(loadedPassageSet);
        setPassageSetError(null);
      } catch (error) {
        console.error('Failed to load passage set:', error);
        setPassageSetError(error instanceof Error ? error.message : 'Failed to load passage set');
        setPassageSet(null);
      }
    };

    loadPassageSet();
  }, []);

  // Clear loading state when navigation completes (current reference changes)
  useEffect(() => {

    setIsNavigating(false);
  }, [currentReference.book, currentReference.chapter, currentReference.verse, currentReference.endChapter, currentReference.endVerse]);

  // Alternative approach: Clear isNavigating when currentReference object changes
  useEffect(() => {
    if (isNavigating) {
      
      setIsNavigating(false);
    }
  }, [currentReference, isNavigating]);

  // More robust approach: Compare reference values and clear isNavigating
  useEffect(() => {
    const prevRef = previousReferenceRef.current;
    const currentRef = currentReference;
    
    // Check if any reference values have changed
    const hasChanged = 
      prevRef.book !== currentRef.book ||
      prevRef.chapter !== currentRef.chapter ||
      prevRef.verse !== currentRef.verse ||
      prevRef.endChapter !== currentRef.endChapter ||
      prevRef.endVerse !== currentRef.endVerse;
    
    if (hasChanged && isNavigating) {

      setIsNavigating(false);
    }
    
    // Update the ref for next comparison
    previousReferenceRef.current = currentRef;
  }, [currentReference, isNavigating]);

  // Safety timeout to clear isNavigating state if it gets stuck
  useEffect(() => {
    if (isNavigating) {
      const timeout = setTimeout(() => {
        console.warn('⚠️ isNavigating state stuck, forcing clear');
        setIsNavigating(false);
      }, 5000); // 5 second timeout

      return () => clearTimeout(timeout);
    }
  }, [isNavigating]);

  // Convert TranslatorSection to Section format
  const convertTranslatorSections = useCallback((translatorSections: TranslatorSection[]): Section[] => {
    return translatorSections.map((section, index) => {
      const startRef = `${section.start.chapter}:${section.start.verse}`;
      const endRef = `${section.end.chapter}:${section.end.verse}`;
      
      // Create a descriptive title
      let title = `${index + 1}`;
      if (section.start.chapter === section.end.chapter) {
        if (section.start.verse === section.end.verse) {
          title = `${section.start.chapter}:${section.start.verse}`;
        } else {
          title = `${section.start.chapter}:${section.start.verse}-${section.end.verse}`;
        }
      } else {
        title = `${startRef} - ${endRef}`;
      }
      
      return {
        title,
        range: {
          startChapter: section.start.chapter,
          startVerse: section.start.verse,
          endChapter: section.end.chapter,
          endVerse: section.end.verse
        }
      };
    });
  }, []);

  // Load book content data when book changes
  useEffect(() => {
    const loadBookData = async () => {
      if (!anchorResource || !resourceManager || !appReady) {
        
        return;
      }

      setIsContentLoaded(false);
      
      // Set a timeout to ensure content loading doesn't get stuck
      const loadingTimeout = setTimeout(() => {
        console.warn(`⚠️ Content loading timeout for ${currentReference.book}, using fallback data`);
        setChapterCount(1);
        setVerseCountByChapter({ 1: 31 });
        setSections([
          { title: 'Chapter 1', range: { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 31 } }
        ]);
        setIsContentLoaded(true);
      }, 10000); // 10 second timeout
      
      try {
        // Build content key for the current book
        const contentKey = `${anchorResource.server}/${anchorResource.owner}/${anchorResource.language}/${anchorResource.id}/${currentReference.book}`;
        
        
        
        // Load content from anchor resource
        const content = await resourceManager.getOrFetchContent(contentKey, anchorResource.type);
        
        // Clear the timeout since we got content
        clearTimeout(loadingTimeout);
        
        if (content && 'chapters' in content && content.chapters) {
          // Extract chapter count
          const chapters = content.chapters as any[];
          const count = chapters.length;
          setChapterCount(count);
          
          // Extract verse counts for all chapters from the loaded content
          const verseCounts: Record<number, number> = {};
          chapters.forEach((chapter: { verses?: any[] }, index: number) => {
            const chapterNumber = index + 1;
            verseCounts[chapterNumber] = chapter.verses?.length || 31;
          });
          setVerseCountByChapter(verseCounts);
          
          // Extract sections from the loaded content
          if ('translatorSections' in content && content.translatorSections && Array.isArray(content.translatorSections) && content.translatorSections.length > 0) {
            const convertedSections = convertTranslatorSections(content.translatorSections as TranslatorSection[]);
            setSections(convertedSections);
          } else {
            // No translator sections found, use chapter-based fallback
            const fallbackSections = [];
            for (let chapter = 1; chapter <= count; chapter++) {
              fallbackSections.push({
                title: `Chapter ${chapter}`,
                range: { 
                  startChapter: chapter, 
                  startVerse: 1, 
                  endChapter: chapter, 
                  endVerse: verseCounts[chapter] || 31 
                }
              });
            }
            setSections(fallbackSections);
          }
          
          
        } else {
          console.warn(`⚠️ EnhancedScriptureNavigator: No chapter data found for ${currentReference.book}`);
          // Fallback to minimal data
          setChapterCount(1);
          setVerseCountByChapter({ 1: 31 });
          setSections([
            { title: 'Chapter 1', range: { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 31 } }
          ]);
        }
        
        setIsContentLoaded(true);
      } catch (error) {
        console.warn(`⚠️ EnhancedScriptureNavigator failed to load book data for ${currentReference.book}:`, error);
        // Clear the timeout since we're handling the error
        clearTimeout(loadingTimeout);
        // Fallback to minimal data
        setChapterCount(1);
        setVerseCountByChapter({ 1: 31 });
        setSections([
          { title: 'Chapter 1', range: { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 31 } }
        ]);
        setIsContentLoaded(true);
      }
    };

    loadBookData();
  }, [currentReference.book, anchorResource, resourceManager, appReady, convertTranslatorSections]);

  const formatReferenceOnly = useCallback(() => {
    const chapter = currentReference.chapter || 1;
    const verse = currentReference.verse;
    
    if (verse) {
      if (currentReference.endChapter && currentReference.endVerse) {
        // If same chapter, show simplified format: 1:1-6 (only if different verses)
        if (currentReference.endChapter === chapter) {
          if (currentReference.endVerse !== verse) {
            return `${chapter}:${verse}-${currentReference.endVerse}`;
          }
          return `${chapter}:${verse}`; // Same verse, no range needed
        }
        // Different chapters, show full format: 1:1-2:5
        return `${chapter}:${verse}-${currentReference.endChapter}:${currentReference.endVerse}`;
      } else if (currentReference.endVerse && currentReference.endVerse !== verse) {
        // Same chapter range: 1:1-6 (only if different verses)
        return `${chapter}:${verse}-${currentReference.endVerse}`;
      }
      return `${chapter}:${verse}`;
    }
    return `${chapter}`;
  }, [currentReference]);

  const handleBookSelect = useCallback((bookCode: string) => {
    
    
    try {
      // Close modal immediately for better UX
      setIsBookModalOpen(false);
      // Set loading state immediately
      
      setIsNavigating(true);
      // Trigger navigation
      navigateToBook(bookCode);
    } catch (error) {
      console.error('Failed to navigate to book:', error);
      // Clear loading state on error
      setIsNavigating(false);
    }
  }, [navigateToBook]);

  const handleRangeSelect = useCallback((range: VerseRange) => {
    
    
    try {
      // Close modal immediately for better UX
      setIsNavModalOpen(false);
      // Set loading state immediately
      
      setIsNavigating(true);
      
      // Create a new reference that preserves the current book
      const newReference = {
        book: currentReference.book, // Always use the current book from context
        chapter: range.startChapter,
        verse: range.startVerse,
        endChapter: range.endChapter,
        endVerse: range.endVerse
      };
      
      // Trigger navigation
      navigateToReference(newReference);
    } catch (error) {
      console.error('Failed to navigate to range:', error);
      // Clear loading state on error
      setIsNavigating(false);
    }
  }, [currentReference.book, navigateToReference]);

  const handlePassageSelect = useCallback((passage: Passage) => {
    try {
      
      
      // Close modal immediately for better UX
      setIsBookModalOpen(false);
      // Set loading state immediately
      
      setIsNavigating(true);
      
      // Convert passage reference to navigation format
      // NavigationContext expects lowercase book codes
      let reference: {
        book: string;
        chapter?: number;
        verse?: number;
        endChapter?: number;
        endVerse?: number;
      } = {
        book: passage.bookCode.toLowerCase()
      };

      if (typeof passage.ref === 'string') {
        // Parse string reference like "1:1-25"
        const parsed = parsePassageString(`${passage.bookCode} ${passage.ref}`);
        if (typeof parsed.ref === 'object') {
          reference = {
            book: parsed.bookCode.toLowerCase(),
            chapter: parsed.ref.startChapter,
            verse: parsed.ref.startVerse,
            endChapter: parsed.ref.endChapter,
            endVerse: parsed.ref.endVerse
          };
        }
      } else {
        // Use RefRange object directly
        reference = {
          book: passage.bookCode.toLowerCase(),
          chapter: passage.ref.startChapter,
          verse: passage.ref.startVerse,
          endChapter: passage.ref.endChapter,
          endVerse: passage.ref.endVerse
        };
      }

      // Fix endChapter when it's undefined but endVerse is defined
      // This ensures proper range filtering in the scripture viewer
      if (reference.endVerse !== undefined && reference.endChapter === undefined) {
        reference.endChapter = reference.chapter;
      }

      // Trigger navigation
      navigateToReference(reference);
    } catch (error) {
      console.error('Failed to navigate to passage:', error);
      // Clear loading state on error
      setIsNavigating(false);
    }
  }, [navigateToReference]);

  // Don't render if anchor resource is not available
  if (!anchorResource || !appReady) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingButton}>
          <Icon name="book-open" size={24} color="#000000" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
        <View style={styles.loadingButton}>
          <Icon name="search" size={24} color="#000000" />
          <Text style={styles.loadingText}>...</Text>
        </View>
      </View>
    );
  }


  return (
    <>
      <View style={styles.container}>
        {/* Book Selection Button */}
        <Pressable
          onPress={() => setIsBookModalOpen(true)}
          disabled={isNavigating}
          style={[
            styles.button,
            styles.navBookButton,
            isNavigating && styles.buttonDisabled
          ]}
        >
          <Icon 
            name="book-open" 
            size={16} 
            color={isNavigating ? "#9ca3af" : "#3b82f6"} 
          />
          <Text style={[
            styles.buttonText,
            isNavigating && styles.buttonTextDisabled
          ]}>
            {currentReference.book.toUpperCase()}
          </Text>
          {isNavigating && (
            <Text style={styles.spinner}>⟳</Text>
          )}
        </Pressable>

        {/* Chapter/Verse Navigation Button */}
        <Pressable
          onPress={() => setIsNavModalOpen(true)}
          disabled={!isContentLoaded || isNavigating}
          style={[
            styles.button,
            styles.referenceButton,
            (!isContentLoaded || isNavigating) && styles.buttonDisabled
          ]}
        >
          <Text 
            style={[
              styles.buttonText,
              styles.referenceButtonText,
              (!isContentLoaded || isNavigating) && styles.buttonTextDisabled
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {formatReferenceOnly()}
          </Text>
          {isNavigating && (
            <Text style={styles.spinner}>⟳</Text>
          )}
        </Pressable>
      </View>

      {/* Book Selection Modal */}
      <Modal
        visible={isBookModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsBookModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Book</Text>
            <Pressable
              onPress={() => setIsBookModalOpen(false)}
              style={styles.closeButton}
            >
              <Icon name="close" size={20} color="#6b7280" />
            </Pressable>
          </View>

          {/* Book Modal Tabs */}
          <View style={styles.tabContainer}>
            <Pressable
              onPress={() => setBookModalTab('books')}
              style={[
                styles.tab,
                bookModalTab === 'books' && styles.tabActive
              ]}
            >
              <Icon name="book-open" size={16} color={bookModalTab === 'books' ? "#3b82f6" : "#6b7280"} />
              <Text style={[
                styles.tabText,
                bookModalTab === 'books' && styles.tabTextActive
              ]}>
                Books
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBookModalTab('passages')}
              style={[
                styles.tab,
                bookModalTab === 'passages' && styles.tabActive
              ]}
            >
              <Icon name="layers" size={16} color={bookModalTab === 'passages' ? "#3b82f6" : "#6b7280"} />
              <Text style={[
                styles.tabText,
                bookModalTab === 'passages' && styles.tabTextActive
              ]}>
                Passage Sets
              </Text>
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {bookModalTab === 'books' && (
              <View style={styles.bookGrid}>
                {availableBooks.map((book) => (
                  <Pressable
                    key={book.code}
                    onPress={() => handleBookSelect(book.code)}
                    style={[
                      styles.bookButton,
                      currentReference.book === book.code && styles.bookButtonSelected
                    ]}
                  >
                    <View style={styles.bookButtonContent}>
                      <Text style={[
                        styles.bookButtonText,
                        currentReference.book === book.code && styles.bookButtonTextSelected
                      ]}>
                        {book.name}
                      </Text>
                      <View style={[
                        styles.bookCodeChip,
                        currentReference.book === book.code && styles.bookCodeChipSelected
                      ]}>
                        <Text style={[
                          styles.bookCodeText,
                          currentReference.book === book.code && styles.bookCodeTextSelected
                        ]}>
                          {book.code.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {bookModalTab === 'passages' && (
              <PassageSetSelector
                passageSet={passageSet}
                error={passageSetError}
                onPassageSelect={handlePassageSelect}
                getBookInfo={(bookCode) => {
                  const book = availableBooks.find(b => b.code === bookCode.toLowerCase());
                  return book ? { name: book.name, code: book.code } : null;
                }}
              />
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Chapter/Verse Navigation Modal */}
      <Modal
        visible={isNavModalOpen && isContentLoaded}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsNavModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Navigate to Reference</Text>
            <Pressable
              onPress={() => setIsNavModalOpen(false)}
              style={styles.closeButton}
            >
              <Icon name="close" size={20} color="#6b7280" />
            </Pressable>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabContainer}>
            <Pressable
              onPress={() => setNavTab('range')}
              style={[
                styles.tab,
                navTab === 'range' && styles.tabActive
              ]}
            >
              <Icon name="grid" size={16} color={navTab === 'range' ? "#3b82f6" : "#6b7280"} />
              <Text style={[
                styles.tabText,
                navTab === 'range' && styles.tabTextActive
              ]}>
                Range
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setNavTab('sections')}
              style={[
                styles.tab,
                navTab === 'sections' && styles.tabActive
              ]}
            >
              <Icon name="list" size={16} color={navTab === 'sections' ? "#3b82f6" : "#6b7280"} />
              <Text style={[
                styles.tabText,
                navTab === 'sections' && styles.tabTextActive
              ]}>
                Sections
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            {navTab === 'range' && (
              <RangeSelector
                chapterCount={chapterCount}
                verseCountByChapter={verseCountByChapter}
                currentReference={currentReference}
                onRangeSelect={handleRangeSelect}
              />
            )}

            {navTab === 'sections' && (
              <SectionsNavigator
                sections={sections}
                currentReference={currentReference}
                onRangeSelect={handleRangeSelect}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// Range Selector Component
interface RangeSelectorProps {
  chapterCount: number;
  verseCountByChapter: Record<number, number>;
  currentReference: { book: string; chapter?: number; verse?: number; endChapter?: number; endVerse?: number };
  onRangeSelect: (range: VerseRange) => void;
}

function RangeSelector({ chapterCount, verseCountByChapter, currentReference, onRangeSelect }: RangeSelectorProps) {
  const [selectedStart, setSelectedStart] = useState<{ chapter: number; verse: number } | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<{ chapter: number; verse: number } | null>(null);

  // Initialize selection with current reference when component mounts
  useEffect(() => {
    if (currentReference.chapter && currentReference.verse) {
      const start = {
        chapter: currentReference.chapter,
        verse: currentReference.verse
      };
      
      const end = (currentReference.endChapter && currentReference.endVerse) ? {
        chapter: currentReference.endChapter,
        verse: currentReference.endVerse
      } : null;
      
      setSelectedStart(start);
      setSelectedEnd(end);
    }
  }, [currentReference.chapter, currentReference.verse, currentReference.endChapter, currentReference.endVerse]); // Include all dependencies

  const handleVerseClick = useCallback((chapter: number, verse: number) => {
    if (!selectedStart) {
      // First selection
      setSelectedStart({ chapter, verse });
      setSelectedEnd(null);
    } else if (!selectedEnd) {
      // Second selection - determine range
      const start = selectedStart;
      const end = { chapter, verse };
      
      // Ensure start comes before end
      const isEndAfterStart = 
        end.chapter > start.chapter || 
        (end.chapter === start.chapter && end.verse >= start.verse);
      
      if (isEndAfterStart) {
        setSelectedEnd(end);
      } else {
        // Swap if end comes before start
        setSelectedStart(end);
        setSelectedEnd(start);
      }
    } else {
      // Reset and start new selection
      setSelectedStart({ chapter, verse });
      setSelectedEnd(null);
    }
  }, [selectedStart, selectedEnd]);

  const isVerseInRange = useCallback((chapter: number, verse: number) => {
    if (!selectedStart) return false;
    
    const start = selectedStart;
    const end = selectedEnd || selectedStart;
    
    // Ensure proper ordering
    const actualStart = 
      end.chapter < start.chapter || 
      (end.chapter === start.chapter && end.verse < start.verse) 
        ? end : start;
    const actualEnd = actualStart === start ? end : start;
    
    return (
      (chapter > actualStart.chapter || (chapter === actualStart.chapter && verse >= actualStart.verse)) &&
      (chapter < actualEnd.chapter || (chapter === actualEnd.chapter && verse <= actualEnd.verse))
    );
  }, [selectedStart, selectedEnd]);

  return (
    <View style={styles.rangeContainer}>
      <ScrollView style={styles.chaptersContainer}>
        {Array.from({ length: chapterCount }, (_, i) => i + 1).map((chapter) => {
          const verseCount = verseCountByChapter[chapter] || 31;
          return (
            <View key={chapter} style={styles.chapterSection}>
              <Text style={styles.chapterTitle}>Chapter {chapter}</Text>
              <View style={styles.verseGrid}>
                {Array.from({ length: verseCount }, (_, i) => i + 1).map((verse) => {
                  const isSelected = 
                    (selectedStart?.chapter === chapter && selectedStart?.verse === verse) ||
                    (selectedEnd?.chapter === chapter && selectedEnd?.verse === verse);
                  const isInRange = isVerseInRange(chapter, verse);
                  
                  return (
                    <Pressable
                      key={verse}
                      onPress={() => handleVerseClick(chapter, verse)}
                      style={[
                        styles.verseButton,
                        isSelected && styles.verseButtonSelected,
                        isInRange && !isSelected && styles.verseButtonInRange
                      ]}
                    >
                      <Text style={[
                        styles.verseButtonText,
                        isSelected && styles.verseButtonTextSelected,
                        isInRange && !isSelected && styles.verseButtonTextInRange
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
      
      {/* Done Button */}
      {selectedStart && (
        <View style={styles.doneContainer}>
          <Pressable
            onPress={() => {
              const range: VerseRange = {
                startChapter: selectedStart.chapter,
                startVerse: selectedStart.verse,
                endChapter: selectedEnd?.chapter || selectedStart.chapter,
                endVerse: selectedEnd?.verse || selectedStart.verse
              };
              onRangeSelect(range);
            }}
            style={styles.doneButton}
          >
            <Icon name="check" size={16} color="white" />
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Sections Navigator Component
interface SectionsNavigatorProps {
  sections: Section[];
  currentReference: { book: string; chapter?: number; verse?: number; endChapter?: number; endVerse?: number };
  onRangeSelect: (range: VerseRange) => void;
}

function SectionsNavigator({ sections, currentReference, onRangeSelect }: SectionsNavigatorProps) {
  if (sections.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="info" size={24} color="#9ca3af" />
        <Text style={styles.emptyText}>No sections available</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionsContainer}>
      {sections.map((section, index) => {
        const isSelected = 
          currentReference.chapter === section.range.startChapter &&
          currentReference.verse === section.range.startVerse &&
          currentReference.endChapter === section.range.endChapter &&
          currentReference.endVerse === section.range.endVerse;
          
        return (
          <Pressable
            key={index}
            onPress={() => onRangeSelect(section.range)}
            style={[
              styles.sectionButton,
              isSelected && styles.sectionButtonSelected
            ]}
          >
            <Text style={[
              styles.sectionButtonText,
              isSelected && styles.sectionButtonTextSelected
            ]}>
              {section.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    gap: 8,
  },
  navBookButton: {
    maxWidth: 100,
    minWidth: 80,
  },
  referenceButton: {
    maxWidth: 120,
    minWidth: 80,
  },
  buttonDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
  },
  buttonText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  referenceButtonText: {
    flex: 1,
  },
  buttonTextDisabled: {
    color: '#6b7280',
  },
  chevron: {
    fontSize: 12,
    color: '#9ca3af',
  },
  spinner: {
    fontSize: 14,
    color: '#9ca3af',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bookButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
    minWidth: '48%',
  },
  bookButtonSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  bookButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bookButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  bookButtonTextSelected: {
    color: '#1e40af',
  },
  bookCodeChip: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bookCodeChipSelected: {
    backgroundColor: '#3b82f6',
  },
  bookCodeText: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  bookCodeTextSelected: {
    color: 'white',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  tabActive: {
    backgroundColor: '#dbeafe',
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  rangeContainer: {
    flex: 1,
  },
  chaptersContainer: {
    flex: 1,
    maxHeight: 400,
  },
  chapterSection: {
    marginBottom: 16,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  verseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  verseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  verseButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  verseButtonInRange: {
    backgroundColor: '#bfdbfe',
  },
  verseButtonText: {
    fontSize: 12,
    color: '#374151',
  },
  verseButtonTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  verseButtonTextInRange: {
    color: '#1e40af',
  },
  doneContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    gap: 8,
  },
  doneButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  sectionsContainer: {
    gap: 8,
  },
  sectionButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  sectionButtonSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  sectionButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  sectionButtonTextSelected: {
    color: '#1e40af',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});
