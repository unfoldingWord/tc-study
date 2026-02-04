/**
 * Translation Questions Viewer Component
 * 
 * Displays Translation Questions (TQ) content with filtering and navigation
 */

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useWorkspaceSelector } from '../../contexts/WorkspaceContext';
import { ProcessedQuestions, TranslationQuestion } from '../../services/questions-processor';
import { ResourceType } from '../../types/context';

export interface QuestionsViewerProps {
  resourceId: string;
  loading?: boolean;
  error?: string;
  questions?: ProcessedQuestions;
  currentChapter?: number;
}

export function QuestionsViewer({ 
  resourceId, 
  loading = false, 
  error, 
  questions: propQuestions, 
  currentChapter = 1 
}: QuestionsViewerProps) {
  const resourceManager = useWorkspaceSelector(state => state.resourceManager);
  const processedResourceConfig = useWorkspaceSelector(state => state.processedResourceConfig);
  const { currentReference } = useNavigation();
  
  const [actualQuestions, setActualQuestions] = useState<ProcessedQuestions | null>(propQuestions || null);
  const [contentLoading, setContentLoading] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(error || null);

  // Load questions content when reference changes
  useEffect(() => {
    if (!resourceManager || !currentReference || propQuestions) {
      return; // Use prop questions if provided
    }

    const loadQuestions = async () => {
      setContentLoading(true);
      setDisplayError(null);

      try {
        
        
        // Find the resource config to get the correct adapter resource ID
        const resourceConfig = processedResourceConfig?.find((config: { panelResourceId: string; metadata: { server: string; owner: string; language: string; id: string; type: string } }) => config.panelResourceId === resourceId);
        if (!resourceConfig) {
          throw new Error(`Resource config not found for ${resourceId}`);
        }
        
        // Construct the full content key in the same format as NotesViewer
        const contentKey = `${resourceConfig.metadata.server}/${resourceConfig.metadata.owner}/${resourceConfig.metadata.language}/${resourceConfig.metadata.id}/${currentReference.book}`;
        
        const content = await resourceManager.getOrFetchContent(
          contentKey, // Full key format: server/owner/language/resourceId/book
          resourceConfig.metadata.type as ResourceType // Resource type from metadata
        );
        
        if (content) {
          const processedQuestions = content as unknown as ProcessedQuestions;
          if (processedQuestions && processedQuestions.questions && Array.isArray(processedQuestions.questions)) {
            setActualQuestions(processedQuestions);
            
          } else {
            console.warn(`⚠️ Invalid questions data structure:`, processedQuestions);
            setDisplayError(`Invalid Translation Questions data for ${currentReference.book}`);
          }
        } else {
          setDisplayError(`No Translation Questions found for ${currentReference.book}`);
        }
      } catch (err) {
        console.error(`❌ Failed to load Translation Questions:`, err);
        setDisplayError(err instanceof Error ? err.message : 'Failed to load Translation Questions');
      } finally {
        setContentLoading(false);
      }
    };

    loadQuestions();
  }, [resourceManager, currentReference, resourceId, propQuestions, processedResourceConfig]);

  // Filter questions based on current navigation reference (matching NotesViewer logic)
  const filteredQuestions = useMemo(() => {
    if (!actualQuestions?.questions || !currentReference) {
      return actualQuestions?.questions || [];
    }
    
    return actualQuestions.questions.filter((question: TranslationQuestion) => {
      // Parse chapter and verse from reference (e.g., "1:1" -> chapter: 1, verse: 1)
      const refParts = question.reference.split(':');
      const questionChapter = parseInt(refParts[0] || '1');
      const questionVerse = parseInt(refParts[1] || '1');
      
      // Determine the range bounds (default to single verse/chapter if no end specified)
      const startChapter = currentReference.chapter;
      const startVerse = currentReference.verse;
      const endChapter = currentReference.endChapter || currentReference.chapter;
      const endVerse = currentReference.endVerse || currentReference.verse;
      
      // Skip filtering if we don't have valid chapter/verse data
      if (!startChapter || !startVerse) {
        return true;
      }
      
      // Check if question is within the chapter range
      if (questionChapter < startChapter) {
        return false;
      }
      if (endChapter && questionChapter > endChapter) {
        return false;
      }
      
      // Filter by start verse in start chapter
      if (questionChapter === startChapter && questionVerse < startVerse) {
        return false;
      }
      
      // Filter by end verse in end chapter
      if (endChapter && endVerse && questionChapter === endChapter && questionVerse > endVerse) {
        return false;
      }
      
      return true;
    });
  }, [actualQuestions?.questions, currentReference]);

  // Loading state
  if (loading || contentLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading Translation Questions...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (displayError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{displayError}</Text>
        </View>
      </View>
    );
  }

  // No questions state
  if (!actualQuestions || filteredQuestions.length === 0) {
    return (
      <View style={styles.noQuestionsContainer}>
        <View style={styles.noQuestionsContent}>
          <Text style={styles.noQuestionsIcon}>❓</Text>
          <Text style={styles.noQuestionsText}>
            No Translation Questions available for this passage
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Questions Content */}
      <ScrollView style={styles.scrollView}>
        <View style={styles.questionsList}>
          {filteredQuestions.map((question, index) => (
            <QuestionCard 
              key={`${question.id}-${index}`} 
              question={question}
              index={index + 1}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

interface QuestionCardProps {
  question: TranslationQuestion;
  index: number;
}

function QuestionCard({ question, index }: QuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.questionCard}>
      {/* Question Header */}
      <Pressable 
        style={[styles.questionHeader, isExpanded && styles.questionHeaderExpanded]}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.questionHeaderContent}>
          <View style={styles.questionHeaderLeft}>
            <View style={styles.questionNumberContainer}>
              <Text style={styles.questionNumber}>{index}</Text>
            </View>
            <Text style={styles.questionReference}>
              {question.reference}
            </Text>
            {question.tags && (
              <Text style={styles.questionTags}>
                • {question.tags}
              </Text>
            )}
          </View>
          <Text style={styles.questionText}>
            {question.question}
          </Text>
          {question.quote && (
            <View style={styles.questionQuoteContainer}>
              <Text style={styles.questionQuoteText}>
                <Text style={styles.questionQuoteLabel}>Quote:</Text> &quot;{question.quote}&quot;
              </Text>
            </View>
          )}
        </View>
        <View style={styles.expandIconContainer}>
          <Text style={[styles.expandIcon, isExpanded && styles.expandIconRotated]}>
            ▼
          </Text>
        </View>
      </Pressable>

      {/* Answer Section */}
      {isExpanded && (
        <View style={styles.answerSection}>
          <View style={styles.answerContent}>
            <View style={styles.answerIndicator}>
              <View style={styles.answerDot} />
            </View>
            <View style={styles.answerTextContainer}>
              <Text style={styles.answerText}>
                {question.response}
              </Text>
            </View>
            
            {/* Additional metadata */}
            <View style={styles.metadataContainer}>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataText}>ID: {question.id}</Text>
                {question.occurrence && (
                  <Text style={styles.metadataText}>Occurrence: {question.occurrence}</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  questionsList: {
    padding: 12,
    gap: 16,
  },
  // Loading states
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256,
  },
  loadingContent: {
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Error states
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256,
  },
  errorContent: {
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 24,
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  // No questions state
  noQuestionsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 256,
  },
  noQuestionsContent: {
    alignItems: 'center',
  },
  noQuestionsIcon: {
    fontSize: 24,
    color: '#9ca3af',
    marginBottom: 8,
  },
  noQuestionsText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Question card styles
  questionCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  questionHeader: {
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  questionHeaderExpanded: {
    backgroundColor: '#f3f4f6',
  },
  questionHeaderContent: {
    flex: 1,
  },
  questionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  questionNumberContainer: {
    width: 24,
    height: 24,
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1e40af',
  },
  questionReference: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionTags: {
    fontSize: 12,
    color: '#9ca3af',
  },
  questionText: {
    fontSize: 16, // Increased from 14 to match Scripture viewer word tokens
    fontWeight: '500',
    color: '#111827',
    lineHeight: 22, // Increased from 20 to maintain proportional spacing
  },
  questionQuoteContainer: {
    marginTop: 8,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  questionQuoteText: {
    fontSize: 12,
    color: '#6b7280',
  },
  questionQuoteLabel: {
    fontWeight: '500',
  },
  expandIconContainer: {
    marginLeft: 16,
    flexShrink: 0,
  },
  expandIcon: {
    fontSize: 20,
    color: '#9ca3af',
  },
  expandIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  // Answer section
  answerSection: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  answerContent: {
    gap: 12,
  },
  answerIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  answerDot: {
    width: 8,
    height: 8,
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  answerTextContainer: {
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#bbf7d0',
  },
  answerText: {
    fontSize: 16, // Increased from 14 to match Scripture viewer word tokens
    color: '#374151',
    lineHeight: 22, // Increased from 20 to maintain proportional spacing
  },
  // Metadata
  metadataContainer: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metadataText: {
    fontSize: 12,
    color: '#6b7280',
  },
});

export default QuestionsViewer;