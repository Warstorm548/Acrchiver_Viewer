/**
 * ArchiveWriter - Handles creating and modifying archives
 */

export class ArchiveWriter {
  constructor() {
    this.CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks
  }

  /**
   * Create new archive from files
   */
  async createArchiveFromFiles(files, format = 'zip') {
    switch (format) {
      case 'zip':
        return await this.createZip(files);
      case 'tar':
        return await this.createTar(files);
      case 'tar.gz':
        return await this.createTarGz(files);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Create ZIP archive using fflate
   */
  async createZip(files) {
    const { zip } = await import('fflate');
    
    const fileMap = {};
    
    for (const file of files) {
      const data = await this.readFile(file);
      fileMap[file.name] = data;
    }

    return new Promise((resolve, reject) => {
      zip(fileMap, { level: 6 }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Create TAR archive
   */
  async createTar(files) {
    let tarData = new Uint8Array(0);

    for (const file of files) {
      const data = await this.readFile(file);
      const header = this.createTarHeader(file.name, data.length);
      
      // Concatenate header, data, and padding
      const paddingSize = (512 - (data.length % 512)) % 512;
      const padding = new Uint8Array(paddingSize);
      
      tarData = this.concatArrays([tarData, header, data, padding]);
    }

    // Add two zero blocks at end
    const endBlocks = new Uint8Array(1024);
    tarData = this.concatArrays([tarData, endBlocks]);

    return tarData;
  }

  /**
   * Create TAR.GZ archive
   */
  async createTarGz(files) {
    const { gzip } = await import('fflate');
    const tarData = await this.createTar(files);
    
    return new Promise((resolve, reject) => {
      gzip(tarData, { level: 6 }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Create TAR header
   */
  createTarHeader(filename, size) {
    const header = new Uint8Array(512);
    
    // Filename (0-99)
    const nameBytes = new TextEncoder().encode(filename);
    header.set(nameBytes.slice(0, 100), 0);
    
    // Mode (100-107)
    header.set(new TextEncoder().encode('0000644 '), 100);
    
    // UID (108-115)
    header.set(new TextEncoder().encode('0000000 '), 108);
    
    // GID (116-123)
    header.set(new TextEncoder().encode('0000000 '), 116);
    
    // Size (124-135)
    const sizeStr = size.toString(8).padStart(11, '0') + ' ';
    header.set(new TextEncoder().encode(sizeStr), 124);
    
    // Mtime (136-147)
    const mtime = Math.floor(Date.now() / 1000);
    const mtimeStr = mtime.toString(8).padStart(11, '0') + ' ';
    header.set(new TextEncoder().encode(mtimeStr), 136);
    
    // Checksum (148-155) - initially spaces
    header.set(new TextEncoder().encode('        '), 148);
    
    // Type flag (156)
    header[156] = '0'.charCodeAt(0); // Regular file
    
    // Magic (257-262)
    header.set(new TextEncoder().encode('ustar'), 257);
    
    // Version (263-264)
    header.set(new TextEncoder().encode('00'), 263);
    
    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    
    const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.set(new TextEncoder().encode(checksumStr), 148);
    
    return header;
  }

  /**
   * Modify existing archive by replacing a file
   */
  async modifyArchive(fileUrl, archiveType, entryPath, newContent, context) {
    // This is a simplified implementation
    // Real implementation would need to:
    // 1. Extract all files except the one being modified
    // 2. Add the modified file
    // 3. Recreate the archive
    
    throw new Error('Archive modification requires full extraction and recreation');
  }

  /**
   * Create archive from specific entries of another archive
   */
  async createArchiveFromEntries(fileUrl, sourceType, entryPaths, targetType, context) {
    const { zip } = await import('fflate');
    const fileMap = {};

    // Extract each requested entry
    for (const entryPath of entryPaths) {
      try {
        const data = await this.extractEntry(fileUrl, sourceType, entryPath, context);
        fileMap[entryPath] = data;
      } catch (error) {
        console.error(`Failed to extract ${entryPath}:`, error);
      }
    }

    // Create new archive
    if (targetType === 'zip') {
      return new Promise((resolve, reject) => {
        zip(fileMap, { level: 6 }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
    } else {
      throw new Error(`Unsupported target format: ${targetType}`);
    }
  }

  /**
   * Extract single entry (placeholder)
   */
  async extractEntry(fileUrl, archiveType, entryPath, context) {
    // This would use StreamProcessor to extract the file
    throw new Error('Entry extraction needs StreamProcessor integration');
  }

  /**
   * Read file as Uint8Array
   */
  async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Concatenate multiple Uint8Arrays
   */
  concatArrays(arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return result;
  }

  /**
   * Add files to existing archive
   */
  async addFilesToArchive(archiveData, archiveType, newFiles) {
    // Extract existing entries
    // Add new files
    // Recreate archive
    throw new Error('Adding files to existing archive not yet implemented');
  }

  /**
   * Remove files from archive
   */
  async removeFilesFromArchive(archiveData, archiveType, entryPaths) {
    // Extract all entries except specified ones
    // Recreate archive
    throw new Error('Removing files from archive not yet implemented');
  }
}
