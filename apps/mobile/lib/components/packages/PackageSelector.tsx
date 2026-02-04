/**
 * Package Selector Component
 * 
 * Allows users to select from default packages or create custom packages.
 * Shown on first launch or when no active package is set.
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { DEFAULT_PACKAGE_TEMPLATES } from '../../config/default-packages';
import { createResourceDiscoveryService } from '../../services/discovery/ResourceDiscoveryService';
import { createDefaultPackageGenerator } from '../../services/packages/DefaultPackageGenerator';
import { LanguageInfo, PackageCategory, ResourcePackage } from '../../types/resource-package';
import { Icon } from '../ui/Icon.native';

interface PackageSelectorProps {
  onPackageSelect: (pkg: ResourcePackage) => void;
  onCreateCustom?: () => void;
  onImport?: () => void;
}

export function PackageSelector({
  onPackageSelect,
  onCreateCustom,
  onImport
}: PackageSelectorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [packages, setPackages] = useState<ResourcePackage[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<ResourcePackage[]>([]);
  
  // Initialize and load languages/packages
  useEffect(() => {
    loadLanguagesAndPackages();
  }, []);
  
  // Filter packages when search or language changes
  useEffect(() => {
    filterPackages();
  }, [searchQuery, selectedLanguage, packages]);
  
  const loadLanguagesAndPackages = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📦 Loading languages and packages...');
      
      const discoveryService = createResourceDiscoveryService();
      const packageGenerator = createDefaultPackageGenerator(discoveryService);
      
      // Load available languages
      const langs = await discoveryService.getAvailableLanguages();
      console.log(`✅ Loaded ${langs.length} languages`);
      console.log('   First 3 languages:', langs.slice(0, 3).map(l => `${l.code}: ${l.name}`));
      
      setLanguages(langs.slice(0, 50)); // Limit to first 50 for performance
      
      // Generate default packages for popular languages
      // Start with a few common ones to avoid long initial load
      const popularLanguages = langs.filter(l => 
        l.code && ['en', 'es-419', 'fr', 'pt-br', 'ar', 'hi', 'ru', 'zh'].includes(l.code)
      );
      
      console.log(`📦 Generating packages for ${popularLanguages.length} popular languages...`);
      
      const defaultPackages: ResourcePackage[] = [];
      for (const lang of popularLanguages) {
        try {
          console.log(`  Loading packages for ${lang.code}...`);
          const langPackages = await packageGenerator.getPackagesForLanguage(lang.code);
          console.log(`  ✅ Got ${langPackages.length} packages for ${lang.code}`);
          defaultPackages.push(...langPackages);
        } catch (err) {
          console.warn(`  ⚠️ Failed to load packages for ${lang.code}:`, err);
          // Continue with other languages
        }
      }
      
      console.log(`✅ Total packages loaded: ${defaultPackages.length}`);
      setPackages(defaultPackages);
      setLoading(false);
      
    } catch (err) {
      console.error('❌ Failed to load packages:', err);
      setError('Failed to load packages. Please check your connection.');
      setLoading(false);
    }
  };
  
  const filterPackages = () => {
    let filtered = packages;
    
    // Filter by selected language
    if (selectedLanguage) {
      filtered = filtered.filter(pkg => 
        pkg.config.defaultLanguage === selectedLanguage
      );
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.name.toLowerCase().includes(query) ||
        pkg.description?.toLowerCase().includes(query)
      );
    }
    
    setFilteredPackages(filtered);
  };
  
  const getCategoryIcon = (category?: PackageCategory): string => {
    switch (category) {
      case PackageCategory.BIBLE_STUDY: return 'book-open';
      case PackageCategory.TRANSLATION: return 'languages';
      case PackageCategory.MINIMAL: return 'book';
      case PackageCategory.REFERENCE: return 'library';
      case PackageCategory.COMPREHENSIVE: return 'layers';
      default: return 'package';
    }
  };
  
  const getCategoryColor = (category?: PackageCategory): string => {
    switch (category) {
      case PackageCategory.BIBLE_STUDY: return '#3b82f6';
      case PackageCategory.TRANSLATION: return '#059669';
      case PackageCategory.MINIMAL: return '#6b7280';
      case PackageCategory.REFERENCE: return '#8b5cf6';
      case PackageCategory.COMPREHENSIVE: return '#dc2626';
      default: return '#374151';
    }
  };
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading available packages...</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color="#dc2626" />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadLanguagesAndPackages}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Package</Text>
        <Text style={styles.subtitle}>Select a pre-configured package or create your own</Text>
      </View>
      
      {/* Search and Filters */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Icon name="search" size={16} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search packages..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>
        
        {/* Language Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <Pressable
            style={[styles.chip, !selectedLanguage && styles.chipActive]}
            onPress={() => setSelectedLanguage(null)}
          >
            <Text style={[styles.chipText, !selectedLanguage && styles.chipTextActive]}>
              All Languages
            </Text>
          </Pressable>
          
          {languages.slice(0, 10).map(lang => (
            <Pressable
              key={lang.code}
              style={[styles.chip, selectedLanguage === lang.code && styles.chipActive]}
              onPress={() => setSelectedLanguage(lang.code)}
            >
              <Text style={[styles.chipText, selectedLanguage === lang.code && styles.chipTextActive]}>
                {lang.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      
      {/* Package List */}
      <ScrollView style={styles.packageList} showsVerticalScrollIndicator={false}>
        {filteredPackages.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="package" size={64} color="#3b82f6" />
            <Text style={styles.emptyTitle}>Welcome to BT Synergy!</Text>
            <Text style={styles.emptyText}>
              Get started by selecting a resource package
            </Text>
            <Text style={styles.emptySubtext}>
              A package contains Bibles, translation helps, and study resources in your language.
            </Text>
            
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <Pressable 
                style={styles.quickActionCard}
                onPress={() => {
                  // Continue without package - will prompt to download later
                  router.replace('/');
                }}
              >
                <Icon name="arrow-right" size={24} color="#3b82f6" />
                <Text style={styles.quickActionTitle}>Continue Anyway</Text>
                <Text style={styles.quickActionText}>
                  You can download resources later from settings
                </Text>
              </Pressable>
              
              <Pressable 
                style={styles.quickActionCard}
                onPress={onImport}
              >
                <Icon name="upload" size={24} color="#059669" />
                <Text style={styles.quickActionTitle}>Import Package</Text>
                <Text style={styles.quickActionText}>
                  Import a pre-downloaded package file
                </Text>
              </Pressable>
            </View>
            
            <Pressable 
              style={styles.refreshButton}
              onPress={loadLanguagesAndPackages}
            >
              <Icon name="refresh-cw" size={16} color="#6b7280" />
              <Text style={styles.refreshButtonText}>Try Loading Again</Text>
            </Pressable>
          </View>
        ) : (
          filteredPackages.map(pkg => (
            <Pressable
              key={pkg.id}
              style={styles.packageCard}
              onPress={() => onPackageSelect(pkg)}
            >
              <View style={styles.packageIcon}>
                <Icon
                  name={getCategoryIcon(pkg.metadata?.category)}
                  size={24}
                  color={getCategoryColor(pkg.metadata?.category)}
                />
              </View>
              
              <View style={styles.packageInfo}>
                <View style={styles.packageHeader}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  {pkg.metadata?.category === PackageCategory.BIBLE_STUDY && (
                    <View style={styles.recommendedBadge}>
                      <Icon name="star" size={10} color="#f59e0b" />
                      <Text style={styles.recommendedText}>Recommended</Text>
                    </View>
                  )}
                </View>
                
                <Text style={styles.packageDescription} numberOfLines={2}>
                  {pkg.description}
                </Text>
                
                <View style={styles.packageMeta}>
                  <View style={styles.metaItem}>
                    <Icon name="layers" size={12} color="#6b7280" />
                    <Text style={styles.metaText}>{pkg.resources.length} resources</Text>
                  </View>
                  {pkg.totalSize && (
                    <View style={styles.metaItem}>
                      <Icon name="download" size={12} color="#6b7280" />
                      <Text style={styles.metaText}>
                        ~{(pkg.totalSize / 1024 / 1024).toFixed(0)} MB
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              
              <Icon name="chevron-right" size={20} color="#9ca3af" />
            </Pressable>
          ))
        )}
      </ScrollView>
      
      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Pressable
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={onCreateCustom}
        >
          <Icon name="plus" size={16} color="#3b82f6" />
          <Text style={styles.actionButtonTextSecondary}>Create Custom</Text>
        </Pressable>
        
        <Pressable
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={onImport}
        >
          <Icon name="upload" size={16} color="#3b82f6" />
          <Text style={styles.actionButtonTextSecondary}>Import Package</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    marginBottom: 24,
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  filterSection: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#3b82f6',
  },
  packageList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 24,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    marginBottom: 32,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 16,
    width: '100%',
  },
  quickActionCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  quickActionTitle: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  quickActionText: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  packageIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageInfo: {
    flex: 1,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  packageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#fef3c7',
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
    textTransform: 'uppercase',
  },
  packageDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  packageMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});



