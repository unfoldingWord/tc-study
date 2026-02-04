/**
 * Resource Manager Demo Component - React Native Version
 * 
 * Demonstrates resource manager functionality.
 * Preserves all original features in React Native format.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useWorkspace } from '../contexts/WorkspaceContext';

interface ResourceManagerDemoProps {
  className?: string;
}

export function ResourceManagerDemo({ className }: ResourceManagerDemoProps) {
  const { resourceManager, processedResourceConfig, anchorResource } = useWorkspace();
  const [demoStatus, setDemoStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [demoResults, setDemoResults] = useState<string[]>([]);

  useEffect(() => {
    if (resourceManager) {
      setDemoStatus('Resource Manager initialized');
    } else {
      setDemoStatus('Resource Manager not available');
    }
  }, [resourceManager]);

  const runDemo = async () => {
    if (!resourceManager) {
      setDemoResults(['❌ Resource Manager not available']);
      return;
    }

    setIsLoading(true);
    setDemoResults([]);
    setDemoStatus('Running demo...');

    try {
      const results: string[] = [];
      
      // Test 1: Get resource config
      results.push('📋 Testing resource configuration...');
      if (processedResourceConfig) {
        results.push(`✅ Found ${processedResourceConfig.length} resource configurations`);
        processedResourceConfig.forEach((config: any, index: number) => {
          results.push(`   ${index + 1}. ${config.metadata?.title || config.id} (${config.metadata?.type || 'unknown'})`);
        });
      } else {
        results.push('❌ No resource configurations found');
      }

      // Test 2: Test content loading
      results.push('📖 Testing content loading...');
      if (anchorResource) {
        results.push(`✅ Anchor resource: ${anchorResource.title} (${anchorResource.type})`);
        
        try {
          const content = await resourceManager.getOrFetchContent(
            `${anchorResource.server}/${anchorResource.owner}/${anchorResource.language}/${anchorResource.resourceId}/gen/1`,
            'scripture'
          );
          
          if (content) {
            results.push('✅ Successfully loaded Genesis 1 content');
            results.push(`   Content type: ${typeof content}`);
            if (content.text) {
              results.push(`   Text length: ${content.text.length} characters`);
            }
          } else {
            results.push('❌ Failed to load content');
          }
        } catch (error) {
          results.push(`❌ Error loading content: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        results.push('❌ No anchor resource available');
      }

      // Test 3: Test resource metadata
      results.push('📊 Testing resource metadata...');
      if (processedResourceConfig && processedResourceConfig.length > 0) {
        const config = processedResourceConfig[0];
        results.push(`✅ First resource: ${config.metadata?.title || config.id}`);
        results.push(`   Type: ${config.metadata?.type || 'unknown'}`);
        results.push(`   Language: ${config.metadata?.language || 'unknown'}`);
        results.push(`   Server: ${config.server || 'unknown'}`);
        results.push(`   Owner: ${config.owner || 'unknown'}`);
      } else {
        results.push('❌ No resource metadata available');
      }

      setDemoResults(results);
      setDemoStatus('Demo completed successfully');
    } catch (error) {
      setDemoResults([`❌ Demo failed: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      setDemoStatus('Demo failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, className && { className }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>Resource Manager Demo</Text>
          
          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text style={styles.statusValue}>{demoStatus}</Text>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={runDemo}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Run Demo</Text>
              )}
            </Pressable>
          </View>

          {demoResults.length > 0 && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>Demo Results:</Text>
              {demoResults.map((result, index) => (
                <Text key={index} style={styles.resultItem}>
                  {result}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Resource Manager Info:</Text>
            <Text style={styles.infoItem}>
              • Resource Manager: {resourceManager ? 'Available' : 'Not Available'}
            </Text>
            <Text style={styles.infoItem}>
              • Resource Configs: {processedResourceConfig ? processedResourceConfig.length : 0}
            </Text>
            <Text style={styles.infoItem}>
              • Anchor Resource: {anchorResource ? anchorResource.title : 'None'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  statusValue: {
    fontSize: 16,
    color: '#6b7280',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  resultItem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
    lineHeight: 20,
  },
  infoContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
});
