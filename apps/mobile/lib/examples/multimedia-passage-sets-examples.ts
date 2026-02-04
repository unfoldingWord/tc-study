/**
 * Examples of Multimedia Passage Sets
 * 
 * Demonstrates how to use images, audio, and combined multimedia labels
 * in hierarchical passage sets for enhanced accessibility and engagement.
 */

import {
    PassageSet
} from '../types/passage-sets';

import {
    createAudioLabel,
    createCombinedLabel,
    createImageLabel,
    createTextLabel,
    createVideoLabel,
    validateMediaContent
} from '../utils/passage-sets';

// ============================================================================
// Example 1: Image-Based Labels for Visual Learners
// ============================================================================

export function createVisualPassageSet(): PassageSet {
  const builder = new PassageSetBuilder('visual-creation-story', 'Creation Story (Visual)');
  
  // Group with image label
  const creationGroup = builder.addGroup('creation-visual', 'Creation Story');
  creationGroup.multimediaLabel = createImageLabel('/images/creation-banner.jpg', {
    alt: 'Creation Story - Seven Days of Creation',
    caption: 'The Biblical Account of Creation',
    dimensions: { width: 800, height: 200 },
    format: 'jpg',
    thumbnail: '/images/creation-banner-thumb.jpg'
  });
  
  // Individual passages with specific images
  const day1 = builder.addPassage(creationGroup.id, 'day1', [
    {
      bookCode: 'GEN',
      ref: '1:1-5',
      label: 'Day 1: Light and Darkness',
      multimediaLabel: createImageLabel('/images/day1-light.svg', {
        alt: 'Day 1: God creates light and separates it from darkness',
        caption: 'Let there be light',
        format: 'svg'
      })
    }
  ]);
  
  const day2 = builder.addPassage(creationGroup.id, 'day2', [
    {
      bookCode: 'GEN',
      ref: '1:6-8',
      label: 'Day 2: Sky and Waters',
      multimediaLabel: createImageLabel('/images/day2-sky.svg', {
        alt: 'Day 2: God separates the waters above from waters below',
        caption: 'The expanse of the heavens',
        format: 'svg'
      })
    }
  ]);
  
  return builder.build();
}

// ============================================================================
// Example 2: Audio-Based Labels for Auditory Learners
// ============================================================================

export function createAudioPassageSet(): PassageSet {
  const builder = new PassageSetBuilder('audio-psalms', 'Psalms (Audio)');
  
  // Group with audio introduction
  const psalmsGroup = builder.addGroup('psalms-audio', 'Book of Psalms');
  psalmsGroup.multimediaLabel = createAudioLabel('/audio/psalms-intro.mp3', {
    alt: 'Introduction to the Book of Psalms',
    caption: 'Listen to an introduction to the Psalms',
    duration: 120, // 2 minutes
    format: 'mp3',
    transcript: 'The Book of Psalms contains 150 songs and prayers...'
  });
  
  // Individual psalms with audio recordings
  const psalm23 = builder.addPassage(psalmsGroup.id, 'psalm23', [
    {
      bookCode: 'PSA',
      ref: '23:1-6',
      label: 'Psalm 23: The Lord is My Shepherd',
      multimediaLabel: createAudioLabel('/audio/psalm23.mp3', {
        alt: 'Psalm 23 - The Lord is My Shepherd',
        caption: 'Listen to Psalm 23 being read',
        duration: 90,
        format: 'mp3',
        transcript: 'The Lord is my shepherd, I shall not want...'
      })
    }
  ]);
  
  return builder.build();
}

// ============================================================================
// Example 3: Combined Multimedia Labels
// ============================================================================

export function createCombinedMultimediaSet(): PassageSet {
  const builder = new PassageSetBuilder('multimedia-parables', 'Parables of Jesus (Multimedia)');
  
  // Group with combined text, image, and audio
  const parablesGroup = builder.addGroup('parables-combined', 'Parables of Jesus');
  
  const textContent = { type: 'text' as const, text: 'Parables of Jesus', alt: 'Parables of Jesus' };
  const imageContent = { type: 'image' as const, src: '/images/jesus-teaching.jpg', alt: 'Jesus teaching parables' };
  const audioContent = { type: 'audio' as const, src: '/audio/parables-intro.mp3', alt: 'Introduction to parables' };
  
  parablesGroup.multimediaLabel = createCombinedLabel(
    textContent,
    [imageContent, audioContent],
    {
      layout: 'horizontal',
      accessibility: {
        screenReaderPreference: 'text',
        highContrast: true,
        largeText: true
      }
    }
  );
  
  // Parable with video content
  const goodSamaritan = builder.addPassage(parablesGroup.id, 'good-samaritan', [
    {
      bookCode: 'LUK',
      ref: '10:25-37',
      label: 'The Good Samaritan',
      multimediaLabel: createVideoLabel('/videos/good-samaritan.mp4', {
        alt: 'The Parable of the Good Samaritan',
        caption: 'Watch the story of the Good Samaritan',
        duration: 300, // 5 minutes
        format: 'mp4',
        poster: '/images/good-samaritan-poster.jpg',
        dimensions: { width: 1920, height: 1080 }
      })
    }
  ]);
  
  return builder.build();
}

// ============================================================================
// Example 4: Accessibility-Focused Multimedia Set
// ============================================================================

export function createAccessiblePassageSet(): PassageSet {
  const builder = new PassageSetBuilder('accessible-gospels', 'Gospels (Accessible)');
  
  // Each passage has multiple formats for different accessibility needs
  const gospelsGroup = builder.addGroup('gospels-accessible', 'The Four Gospels');
  
  const matthew = builder.addPassage(gospelsGroup.id, 'matthew-birth', [
    {
      bookCode: 'MAT',
      ref: '1:18-25',
      label: 'Birth of Jesus (Matthew)',
      multimediaLabel: createCombinedLabel(
        // Primary: Large text for visual accessibility
        {
          type: 'text',
          text: 'Birth of Jesus (Matthew)',
          alt: 'The birth of Jesus Christ as recorded in Matthew chapter 1',
          formatting: {
            fontSize: 'large',
            bold: true,
            color: '#000000'
          }
        },
        [
          // Audio for visually impaired users
          {
            type: 'audio',
            src: '/audio/matthew-1-18-25.mp3',
            alt: 'Audio reading of Matthew 1:18-25',
            duration: 120,
            transcript: 'Now the birth of Jesus Christ was as follows...'
          },
          // High contrast image
          {
            type: 'image',
            src: '/images/nativity-high-contrast.png',
            alt: 'High contrast illustration of the nativity scene',
            format: 'png'
          }
        ],
        {
          layout: 'vertical',
          accessibility: {
            screenReaderPreference: 'text',
            highContrast: true,
            largeText: true
          }
        }
      )
    }
  ]);
  
  return builder.build();
}

// ============================================================================
// Example JSON Structure with Multimedia Labels
// ============================================================================

export const multimediaPassageSetExample = {
  "id": "multimedia-example",
  "name": "Multimedia Passage Set Example",
  "description": "Example showing multimedia labels in JSON format",
  "version": "1.0.0",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "category": "example",
    "difficulty": 2
  },
  "root": [
    {
      "id": "creation-multimedia",
      "type": "group",
      "label": "Creation Story",
      "multimediaLabel": {
        "primary": {
          "type": "image",
          "src": "/images/creation-story.jpg",
          "alt": "Creation Story Illustration",
          "caption": "The Seven Days of Creation",
          "format": "jpg",
          "dimensions": { "width": 800, "height": 400 }
        },
        "secondary": [
          {
            "type": "text",
            "text": "Creation Story",
            "alt": "The Biblical Account of Creation",
            "formatting": { "bold": true, "fontSize": "large" }
          },
          {
            "type": "audio",
            "src": "/audio/creation-intro.mp3",
            "alt": "Introduction to the Creation Story",
            "duration": 60,
            "format": "mp3"
          }
        ],
        "layout": "vertical",
        "accessibility": {
          "screenReaderPreference": "text",
          "highContrast": true
        }
      },
      "children": [
        {
          "id": "day-1",
          "type": "passage",
          "label": "Day 1: Light",
          "multimediaLabel": {
            "primary": {
              "type": "audio",
              "src": "/audio/day1-light.mp3",
              "alt": "Day 1: God creates light",
              "duration": 30,
              "transcript": "And God said, Let there be light..."
            }
          },
          "passages": [
            {
              "bookCode": "GEN",
              "ref": "1:1-5",
              "label": "In the beginning",
              "multimediaLabel": {
                "primary": {
                  "type": "image",
                  "src": "/images/light-creation.svg",
                  "alt": "Light being created on the first day",
                  "format": "svg"
                }
              }
            }
          ]
        }
      ]
    }
  ]
};

// ============================================================================
// Utility Function Examples
// ============================================================================

export function demonstrateMultimediaUtilities() {
  
  
  // Create different types of labels
  const textLabel = createTextLabel('Genesis 1:1', {
    formatting: { bold: true, fontSize: 'large' }
  });
  
  const imageLabel = createImageLabel('/images/genesis.jpg', {
    alt: 'Genesis chapter 1 illustration',
    dimensions: { width: 400, height: 300 }
  });
  
  const audioLabel = createAudioLabel('/audio/genesis.mp3', {
    alt: 'Genesis 1:1 audio reading',
    duration: 45,
    transcript: 'In the beginning God created the heavens and the earth'
  });
  
  // Demonstrate utility functions
  
  
  
  
  
  
  
  // Validate content
  const validation = validateMediaContent(imageLabel.primary);
  
  
  // Create combined label
  const combinedLabel = createCombinedLabel(
    textLabel.primary,
    [imageLabel.primary, audioLabel.primary],
    { layout: 'horizontal' }
  );
  
  
  
  
}

// ============================================================================
// Migration Helper: Convert Text Labels to Multimedia
// ============================================================================

export function convertTextLabelsToMultimedia(passageSet: PassageSet): PassageSet {
  function processNode(node: any): any {
    const processed = { ...node };
    
    // Convert text label to multimedia label if no multimedia label exists
    if (processed.label && !processed.multimediaLabel) {
      processed.multimediaLabel = createTextLabel(processed.label, {
        alt: processed.label
      });
    }
    
    // Process children recursively
    if (processed.children) {
      processed.children = processed.children.map(processNode);
    }
    
    // Process passages
    if (processed.passages) {
      processed.passages = processed.passages.map((passage: any) => {
        const processedPassage = { ...passage };
        if (processedPassage.label && !processedPassage.multimediaLabel) {
          processedPassage.multimediaLabel = createTextLabel(processedPassage.label, {
            alt: processedPassage.label
          });
        }
        return processedPassage;
      });
    }
    
    return processed;
  }
  
  return {
    ...passageSet,
    root: passageSet.root.map(processNode)
  };
}
