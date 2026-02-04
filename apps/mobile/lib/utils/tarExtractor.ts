/**
 * Simple TAR file extractor
 * 
 * Parses TAR format and extracts files to the file system.
 * TAR format is simple: 512-byte header followed by file data, padded to 512-byte blocks.
 */

import { File, Directory } from 'expo-file-system';

interface TarHeader {
  fileName: string;
  fileSize: number;
  fileType: string;
  isDirectory: boolean;
}

export class TarExtractor {
  /**
   * Parse TAR header (512 bytes)
   */
  private static parseTarHeader(headerBytes: Uint8Array): TarHeader | null {
    // TAR header structure (USTAR format):
    // Offset  Size  Field
    // 0       100   File name
    // 100     8     File mode
    // 108     8     Owner's numeric user ID
    // 116     8     Group's numeric user ID
    // 124     12    File size in bytes (octal)
    // 136     12    Last modification time (octal)
    // 148     8     Checksum for header record
    // 156     1     Link indicator (file type)
    // 257     6     UStar indicator ("ustar")
    
    // Check if this is a valid header (has "ustar" at offset 257)
    const ustarIndicator = new TextDecoder().decode(headerBytes.slice(257, 263));
    if (!ustarIndicator.startsWith('ustar')) {
      return null; // End of archive or invalid header
    }
    
    // Extract file name (trim null bytes)
    const fileNameBytes = headerBytes.slice(0, 100);
    let fileName = '';
    for (let i = 0; i < fileNameBytes.length; i++) {
      if (fileNameBytes[i] === 0) break;
      fileName += String.fromCharCode(fileNameBytes[i]);
    }
    
    // Extract file size (octal string)
    const fileSizeBytes = headerBytes.slice(124, 136);
    let fileSizeStr = '';
    for (let i = 0; i < fileSizeBytes.length; i++) {
      if (fileSizeBytes[i] === 0 || fileSizeBytes[i] === 32) break; // null or space
      fileSizeStr += String.fromCharCode(fileSizeBytes[i]);
    }
    const fileSize = parseInt(fileSizeStr.trim(), 8) || 0;
    
    // Extract file type
    const fileType = String.fromCharCode(headerBytes[156]);
    const isDirectory = fileType === '5' || fileName.endsWith('/');
    
    return {
      fileName: fileName.trim(),
      fileSize,
      fileType,
      isDirectory
    };
  }
  
  /**
   * Extract TAR archive to destination directory
   */
  static async extract(tarData: Uint8Array, destPath: string): Promise<void> {
    console.log(`📦 Extracting TAR archive (${(tarData.length / 1024 / 1024).toFixed(2)} MB) to ${destPath}...`);
    
    let offset = 0;
    let filesExtracted = 0;
    let directoriesCreated = 0;
    
    while (offset < tarData.length) {
      // Read 512-byte header
      const headerBytes = tarData.slice(offset, offset + 512);
      offset += 512;
      
      // Parse header
      const header = this.parseTarHeader(headerBytes);
      
      if (!header || !header.fileName) {
        // End of archive or padding
        break;
      }
      
      const fullPath = `${destPath}/${header.fileName}`;
      
      if (header.isDirectory) {
        // Create directory
        const dir = new Directory(fullPath);
        if (!dir.exists) {
          dir.create();
          directoriesCreated++;
          if (directoriesCreated % 10 === 0) {
            console.log(`   📁 Created ${directoriesCreated} directories...`);
          }
        }
        
        // Directories have no data, move to next header
        continue;
      }
      
      // Read file data
      const fileData = tarData.slice(offset, offset + header.fileSize);
      offset += header.fileSize;
      
      // TAR blocks are padded to 512 bytes
      const padding = (512 - (header.fileSize % 512)) % 512;
      offset += padding;
      
      // Ensure parent directory exists
      const lastSlash = fullPath.lastIndexOf('/');
      if (lastSlash > 0) {
        const parentDir = fullPath.substring(0, lastSlash);
        const dir = new Directory(parentDir);
        if (!dir.exists) {
          dir.create();
        }
      }
      
      // Write file as base64 (expo-file-system doesn't support direct Uint8Array write)
      // Convert Uint8Array to base64
      let binary = '';
      for (let i = 0; i < fileData.length; i++) {
        binary += String.fromCharCode(fileData[i]);
      }
      const base64Data = btoa(binary);
      
      const file = new File(fullPath);
      await file.write(base64Data, { encoding: 'base64' });
      
      filesExtracted++;
      if (filesExtracted % 50 === 0) {
        console.log(`   ✅ Extracted ${filesExtracted} files...`);
      }
    }
    
    console.log(`✅ TAR extraction complete: ${filesExtracted} files, ${directoriesCreated} directories`);
  }
}

