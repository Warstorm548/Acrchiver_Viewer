/**
 * OpenCloud Archive Viewer
 * Main entry point for the archive viewer web app
 */

import { ArchiveReader } from './lib/ArchiveReader';
import { ArchiveWriter } from './lib/ArchiveWriter';
import { UIManager } from './lib/UIManager';
import { StreamProcessor } from './lib/StreamProcessor';
import './styles/main.css';

class ArchiveViewerApp {
  constructor() {
    this.archiveReader = new ArchiveReader();
    this.archiveWriter = new ArchiveWriter();
    this.uiManager = new UIManager(this);
    this.streamProcessor = new StreamProcessor();
    this.currentArchive = null;
    this.currentArchiveMetadata = null;
    this.selectedFiles = new Set();
  }

  /**
   * Initialize the application
   * @param {Object} context - OpenCloud context
   */
  async init(context) {
    this.context = context;
    this.fileId = context.fileId;
    this.fileName = context.fileName;
    this.fileUrl = context.fileUrl;
    
    // Initialize UI
    await this.uiManager.init();
    
    // Load archive metadata without extracting
    await this.loadArchiveMetadata();
  }

  /**
   * Load archive metadata using streaming
   */
  async loadArchiveMetadata() {
    try {
      this.uiManager.showLoading('Loading archive metadata...');
      
      // Detect archive type from filename
      const archiveType = this.detectArchiveType(this.fileName);
      
      // Get file info to check size
      const fileInfo = await this.context.getFileInfo(this.fileId);
      const fileSize = fileInfo.size;
      
      this.uiManager.updateStatus(`Archive size: ${this.formatFileSize(fileSize)}`);
      
      // Stream metadata extraction for large files
      const metadata = await this.streamProcessor.extractMetadata(
        this.fileUrl,
        archiveType,
        fileSize,
        this.context
      );
      
      this.currentArchiveMetadata = metadata;
      this.currentArchive = {
        type: archiveType,
        name: this.fileName,
        size: fileSize,
        entries: metadata.entries,
        totalFiles: metadata.totalFiles,
        totalDirs: metadata.totalDirs,
        uncompressedSize: metadata.uncompressedSize
      };
      
      // Display archive contents
      this.uiManager.displayArchiveContents(this.currentArchive);
      this.uiManager.hideLoading();
      
    } catch (error) {
      console.error('Error loading archive:', error);
      this.uiManager.showError(`Failed to load archive: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Detect archive type from filename
   */
  detectArchiveType(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar.bz2';
    if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
    if (lower.endsWith('.tar')) return 'tar';
    if (lower.endsWith('.zip')) return 'zip';
    if (lower.endsWith('.gz')) return 'gz';
    if (lower.endsWith('.bz2')) return 'bz2';
    if (lower.endsWith('.xz')) return 'xz';
    if (lower.endsWith('.7z')) return '7z';
    if (lower.endsWith('.rar')) return 'rar';
    throw new Error('Unsupported archive format');
  }

  /**
   * View file contents from archive without extracting entire archive
   */
  async viewFile(entryPath) {
    try {
      this.uiManager.showLoading(`Loading ${entryPath}...`);
      
      const content = await this.streamProcessor.extractSingleFile(
        this.fileUrl,
        this.currentArchive.type,
        entryPath,
        this.context
      );
      
      // Determine if file is text or binary
      const isText = this.isTextFile(entryPath);
      
      if (isText) {
        const textContent = new TextDecoder().decode(content);
        this.uiManager.showFileViewer(entryPath, textContent, 'text');
      } else {
        this.uiManager.showFileViewer(entryPath, content, 'binary');
      }
      
      this.uiManager.hideLoading();
      
    } catch (error) {
      console.error('Error viewing file:', error);
      this.uiManager.showError(`Failed to view file: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Edit file contents (text files only)
   */
  async editFile(entryPath, newContent) {
    try {
      // This requires extracting, modifying, and recreating the archive
      this.uiManager.showLoading('Saving changes...');
      
      // Extract all files, modify the specific file, recreate archive
      const modifiedArchive = await this.archiveWriter.modifyArchive(
        this.fileUrl,
        this.currentArchive.type,
        entryPath,
        newContent,
        this.context
      );
      
      // Upload modified archive back to OpenCloud
      await this.context.saveFile(this.fileId, modifiedArchive);
      
      this.uiManager.showSuccess('File updated successfully');
      this.uiManager.hideLoading();
      
      // Reload metadata
      await this.loadArchiveMetadata();
      
    } catch (error) {
      console.error('Error editing file:', error);
      this.uiManager.showError(`Failed to save changes: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Download single file from archive
   */
  async downloadFile(entryPath) {
    try {
      this.uiManager.showLoading(`Downloading ${entryPath}...`);
      
      const content = await this.streamProcessor.extractSingleFile(
        this.fileUrl,
        this.currentArchive.type,
        entryPath,
        this.context
      );
      
      // Trigger browser download
      const blob = new Blob([content]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entryPath.split('/').pop();
      a.click();
      URL.revokeObjectURL(url);
      
      this.uiManager.hideLoading();
      
    } catch (error) {
      console.error('Error downloading file:', error);
      this.uiManager.showError(`Failed to download file: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Batch download selected files
   */
  async downloadSelectedFiles() {
    if (this.selectedFiles.size === 0) {
      this.uiManager.showError('No files selected');
      return;
    }

    try {
      this.uiManager.showLoading(`Downloading ${this.selectedFiles.size} files...`);
      
      // Create a new ZIP with selected files
      const zipData = await this.archiveWriter.createArchiveFromEntries(
        this.fileUrl,
        this.currentArchive.type,
        Array.from(this.selectedFiles),
        'zip',
        this.context
      );
      
      // Trigger download
      const blob = new Blob([zipData]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentArchive.name}_selected.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.uiManager.hideLoading();
      this.uiManager.showSuccess(`Downloaded ${this.selectedFiles.size} files`);
      
    } catch (error) {
      console.error('Error batch downloading:', error);
      this.uiManager.showError(`Failed to download files: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Create new archive from uploaded files
   */
  async createArchive(files, format = 'zip') {
    try {
      this.uiManager.showLoading('Creating archive...');
      
      const archiveData = await this.archiveWriter.createArchiveFromFiles(
        files,
        format
      );
      
      // Save to OpenCloud
      const fileName = `archive_${Date.now()}.${format}`;
      await this.context.uploadFile(fileName, archiveData);
      
      this.uiManager.hideLoading();
      this.uiManager.showSuccess('Archive created successfully');
      
    } catch (error) {
      console.error('Error creating archive:', error);
      this.uiManager.showError(`Failed to create archive: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Share archive or specific files via OpenCloud sharing
   */
  async shareFiles(entries) {
    try {
      if (entries.length === 0) {
        // Share entire archive
        const shareLink = await this.context.createShare(this.fileId);
        this.uiManager.showShareDialog(shareLink);
      } else {
        // Extract and share specific files
        this.uiManager.showLoading('Preparing files for sharing...');
        
        const tempArchive = await this.archiveWriter.createArchiveFromEntries(
          this.fileUrl,
          this.currentArchive.type,
          entries,
          'zip',
          this.context
        );
        
        // Upload temp archive and create share link
        const tempFileName = `shared_${Date.now()}.zip`;
        const tempFileId = await this.context.uploadFile(tempFileName, tempArchive);
        const shareLink = await this.context.createShare(tempFileId);
        
        this.uiManager.hideLoading();
        this.uiManager.showShareDialog(shareLink);
      }
      
    } catch (error) {
      console.error('Error sharing files:', error);
      this.uiManager.showError(`Failed to create share link: ${error.message}`);
      this.uiManager.hideLoading();
    }
  }

  /**
   * Toggle file selection
   */
  toggleFileSelection(entryPath) {
    if (this.selectedFiles.has(entryPath)) {
      this.selectedFiles.delete(entryPath);
    } else {
      this.selectedFiles.add(entryPath);
    }
    this.uiManager.updateSelectionCount(this.selectedFiles.size);
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedFiles.clear();
    this.uiManager.updateSelectionCount(0);
  }

  /**
   * Check if file is text-based
   */
  isTextFile(filename) {
    const textExtensions = [
      '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts',
      '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.yaml',
      '.yml', '.toml', '.ini', '.conf', '.sh', '.bat', '.ps1', '.sql'
    ];
    
    return textExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Initialize app when OpenCloud loads it
if (typeof OC !== 'undefined') {
  OC.Plugins.register('files', {
    attach: function(fileList) {
      fileList.registerTabView(new ArchiveViewerApp());
    }
  });
}

// Export for module systems
export default ArchiveViewerApp;
