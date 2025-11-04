/**
 * UIManager - Handles all UI rendering and interactions
 */

export class UIManager {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.currentView = 'list'; // list, viewer, editor
    this.sortBy = 'name';
    this.sortOrder = 'asc';
    this.currentPath = '/';
  }

  /**
   * Initialize UI
   */
  async init() {
    this.container = document.getElementById('app-content');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'app-content';
      document.body.appendChild(this.container);
    }

    this.render();
  }

  /**
   * Render main UI
   */
  render() {
    this.container.innerHTML = `
      <div class="archive-viewer">
        <div class="toolbar">
          <div class="toolbar-left">
            <button id="btn-refresh" class="btn btn-icon" title="Refresh">
              <span class="icon-refresh">↻</span>
            </button>
            <button id="btn-create-archive" class="btn" title="Create Archive">
              <span class="icon-plus">+</span> Create Archive
            </button>
            <button id="btn-download-selected" class="btn" title="Download Selected" disabled>
              <span class="icon-download">⬇</span> Download Selected
            </button>
            <button id="btn-share" class="btn" title="Share">
              <span class="icon-share">⤴</span> Share
            </button>
          </div>
          <div class="toolbar-right">
            <input type="text" id="search-box" placeholder="Search files..." class="search-input">
            <select id="sort-select" class="sort-select">
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
              <option value="type">Sort by Type</option>
            </select>
          </div>
        </div>

        <div class="breadcrumb">
          <span id="breadcrumb-path">/</span>
        </div>

        <div class="status-bar">
          <span id="status-text">Ready</span>
          <span id="selection-count" class="selection-count"></span>
        </div>

        <div id="content-area" class="content-area">
          <div class="loading-overlay" id="loading-overlay" style="display: none;">
            <div class="spinner"></div>
            <div id="loading-text">Loading...</div>
          </div>
          <div id="file-list" class="file-list"></div>
          <div id="file-viewer" class="file-viewer" style="display: none;"></div>
        </div>

        <div class="info-panel">
          <div id="archive-info"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      this.app.loadArchiveMetadata();
    });

    // Create archive button
    document.getElementById('btn-create-archive')?.addEventListener('click', () => {
      this.showCreateArchiveDialog();
    });

    // Download selected button
    document.getElementById('btn-download-selected')?.addEventListener('click', () => {
      this.app.downloadSelectedFiles();
    });

    // Share button
    document.getElementById('btn-share')?.addEventListener('click', () => {
      const selectedEntries = Array.from(this.app.selectedFiles);
      this.app.shareFiles(selectedEntries);
    });

    // Search box
    document.getElementById('search-box')?.addEventListener('input', (e) => {
      this.filterFiles(e.target.value);
    });

    // Sort select
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.refreshFileList();
    });
  }

  /**
   * Display archive contents
   */
  displayArchiveContents(archive) {
    const fileList = document.getElementById('file-list');
    if (!fileList) return;

    // Update archive info
    this.updateArchiveInfo(archive);

    // Group entries by directory
    const tree = this.buildFileTree(archive.entries);
    
    // Display current directory
    this.displayDirectory(tree, this.currentPath);
  }

  /**
   * Build file tree from flat entry list
   */
  buildFileTree(entries) {
    const tree = { name: '/', path: '/', children: {}, files: [] };

    for (const entry of entries) {
      const parts = entry.path.split('/').filter(Boolean);
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (isLast && !entry.isDirectory) {
          current.files.push({
            ...entry,
            name: part
          });
        } else {
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              path: parts.slice(0, i + 1).join('/'),
              children: {},
              files: []
            };
          }
          current = current.children[part];
        }
      }
    }

    return tree;
  }

  /**
   * Display directory contents
   */
  displayDirectory(tree, path) {
    const fileList = document.getElementById('file-list');
    if (!fileList) return;

    // Navigate to path
    let current = tree;
    if (path !== '/') {
      const parts = path.split('/').filter(Boolean);
      for (const part of parts) {
        current = current.children[part];
        if (!current) {
          console.error('Path not found:', path);
          return;
        }
      }
    }

    // Update breadcrumb
    this.updateBreadcrumb(path);

    // Build file list HTML
    let html = '<table class="file-table"><thead><tr>';
    html += '<th class="col-checkbox"><input type="checkbox" id="select-all"></th>';
    html += '<th class="col-name">Name</th>';
    html += '<th class="col-size">Size</th>';
    html += '<th class="col-actions">Actions</th>';
    html += '</tr></thead><tbody>';

    // Add parent directory link if not at root
    if (path !== '/') {
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      html += `
        <tr class="file-row directory" data-path="${parentPath}">
          <td class="col-checkbox"></td>
          <td class="col-name">
            <span class="icon-folder">📁</span>
            <span class="name">..</span>
          </td>
          <td class="col-size">-</td>
          <td class="col-actions"></td>
        </tr>
      `;
    }

    // Add directories
    const directories = Object.values(current.children);
    for (const dir of directories) {
      html += `
        <tr class="file-row directory" data-path="${dir.path}">
          <td class="col-checkbox"></td>
          <td class="col-name">
            <span class="icon-folder">📁</span>
            <span class="name">${this.escapeHtml(dir.name)}</span>
          </td>
          <td class="col-size">-</td>
          <td class="col-actions">
            <button class="btn-action btn-open" title="Open">Open</button>
          </td>
        </tr>
      `;
    }

    // Add files
    for (const file of current.files) {
      const isSelected = this.app.selectedFiles.has(file.path);
      html += `
        <tr class="file-row file ${isSelected ? 'selected' : ''}" data-path="${file.path}">
          <td class="col-checkbox">
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="col-name">
            <span class="icon-file">${this.getFileIcon(file.name)}</span>
            <span class="name">${this.escapeHtml(file.name)}</span>
          </td>
          <td class="col-size">${this.app.formatFileSize(file.uncompressedSize)}</td>
          <td class="col-actions">
            <button class="btn-action btn-view" title="View">👁</button>
            <button class="btn-action btn-download" title="Download">⬇</button>
            ${this.app.isTextFile(file.name) ? '<button class="btn-action btn-edit" title="Edit">✎</button>' : ''}
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    fileList.innerHTML = html;

    // Attach row event listeners
    this.attachFileListeners();
  }

  /**
   * Attach event listeners to file list
   */
  attachFileListeners() {
    // Directory navigation
    document.querySelectorAll('.file-row.directory').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const path = row.dataset.path;
        this.currentPath = path;
        this.app.loadArchiveMetadata();
      });
    });

    // File selection
    document.querySelectorAll('.file-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const row = e.target.closest('.file-row');
        const path = row.dataset.path;
        this.app.toggleFileSelection(path);
        row.classList.toggle('selected', e.target.checked);
      });
    });

    // Select all
    document.getElementById('select-all')?.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.file-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const row = cb.closest('.file-row');
        const path = row.dataset.path;
        if (e.target.checked) {
          this.app.selectedFiles.add(path);
          row.classList.add('selected');
        } else {
          this.app.selectedFiles.delete(path);
          row.classList.remove('selected');
        }
      });
      this.updateSelectionCount(this.app.selectedFiles.size);
    });

    // Action buttons
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.file-row');
        const path = row.dataset.path;
        this.app.viewFile(path);
      });
    });

    document.querySelectorAll('.btn-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.file-row');
        const path = row.dataset.path;
        this.app.downloadFile(path);
      });
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.file-row');
        const path = row.dataset.path;
        this.showFileEditor(path);
      });
    });
  }

  /**
   * Update breadcrumb
   */
  updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb-path');
    if (!breadcrumb) return;

    if (path === '/') {
      breadcrumb.innerHTML = '<span class="crumb">/</span>';
      return;
    }

    const parts = path.split('/').filter(Boolean);
    let html = '<span class="crumb clickable" data-path="/">/</span>';
    
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      const isLast = i === parts.length - 1;
      html += ` <span class="separator">/</span> `;
      html += `<span class="crumb ${isLast ? '' : 'clickable'}" data-path="${currentPath}">${this.escapeHtml(parts[i])}</span>`;
    }

    breadcrumb.innerHTML = html;

    // Attach click listeners
    breadcrumb.querySelectorAll('.crumb.clickable').forEach(crumb => {
      crumb.addEventListener('click', () => {
        this.currentPath = crumb.dataset.path;
        this.app.loadArchiveMetadata();
      });
    });
  }

  /**
   * Update archive info panel
   */
  updateArchiveInfo(archive) {
    const infoPanel = document.getElementById('archive-info');
    if (!infoPanel) return;

    infoPanel.innerHTML = `
      <h3>Archive Information</h3>
      <dl class="info-list">
        <dt>Type:</dt>
        <dd>${archive.type.toUpperCase()}</dd>
        <dt>Size:</dt>
        <dd>${this.app.formatFileSize(archive.size)}</dd>
        <dt>Files:</dt>
        <dd>${archive.totalFiles}</dd>
        <dt>Directories:</dt>
        <dd>${archive.totalDirs}</dd>
        <dt>Uncompressed:</dt>
        <dd>${this.app.formatFileSize(archive.uncompressedSize)}</dd>
        <dt>Compression:</dt>
        <dd>${((1 - archive.size / archive.uncompressedSize) * 100).toFixed(1)}%</dd>
      </dl>
    `;
  }

  /**
   * Show file viewer
   */
  showFileViewer(path, content, type) {
    const viewer = document.getElementById('file-viewer');
    const fileList = document.getElementById('file-list');
    
    if (!viewer) return;

    fileList.style.display = 'none';
    viewer.style.display = 'block';

    if (type === 'text') {
      viewer.innerHTML = `
        <div class="viewer-header">
          <h3>${this.escapeHtml(path)}</h3>
          <button id="btn-close-viewer" class="btn">Close</button>
        </div>
        <pre class="code-viewer"><code>${this.escapeHtml(content)}</code></pre>
      `;
    } else {
      viewer.innerHTML = `
        <div class="viewer-header">
          <h3>${this.escapeHtml(path)}</h3>
          <button id="btn-close-viewer" class="btn">Close</button>
        </div>
        <div class="binary-viewer">
          <p>Binary file - ${content.length} bytes</p>
          <p>Cannot display preview</p>
        </div>
      `;
    }

    document.getElementById('btn-close-viewer')?.addEventListener('click', () => {
      viewer.style.display = 'none';
      fileList.style.display = 'block';
    });
  }

  /**
   * Show file editor
   */
  async showFileEditor(path) {
    // Load file content first
    this.showLoading('Loading file for editing...');
    
    try {
      const content = await this.app.streamProcessor.extractSingleFile(
        this.app.fileUrl,
        this.app.currentArchive.type,
        path,
        this.app.context
      );

      const textContent = new TextDecoder().decode(content);
      
      const viewer = document.getElementById('file-viewer');
      const fileList = document.getElementById('file-list');
      
      fileList.style.display = 'none';
      viewer.style.display = 'block';

      viewer.innerHTML = `
        <div class="viewer-header">
          <h3>Edit: ${this.escapeHtml(path)}</h3>
          <button id="btn-save-file" class="btn btn-primary">Save</button>
          <button id="btn-cancel-edit" class="btn">Cancel</button>
        </div>
        <textarea id="file-editor" class="file-editor">${this.escapeHtml(textContent)}</textarea>
      `;

      document.getElementById('btn-save-file')?.addEventListener('click', async () => {
        const newContent = document.getElementById('file-editor').value;
        await this.app.editFile(path, newContent);
        viewer.style.display = 'none';
        fileList.style.display = 'block';
      });

      document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
        viewer.style.display = 'none';
        fileList.style.display = 'block';
      });

      this.hideLoading();

    } catch (error) {
      this.hideLoading();
      this.showError(`Failed to load file: ${error.message}`);
    }
  }

  /**
   * Show create archive dialog
   */
  showCreateArchiveDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Create Archive</h3>
          <button class="btn-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Archive Format:</label>
            <select id="archive-format" class="form-control">
              <option value="zip">ZIP</option>
              <option value="tar">TAR</option>
              <option value="tar.gz">TAR.GZ</option>
            </select>
          </div>
          <div class="form-group">
            <label>Select Files:</label>
            <input type="file" id="files-input" multiple class="form-control">
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-create" class="btn btn-primary">Create</button>
          <button id="btn-cancel-dialog" class="btn">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const close = () => {
      dialog.remove();
    };

    dialog.querySelector('#modal-close').addEventListener('click', close);
    dialog.querySelector('#btn-cancel-dialog').addEventListener('click', close);
    
    dialog.querySelector('#btn-create').addEventListener('click', async () => {
      const format = document.getElementById('archive-format').value;
      const filesInput = document.getElementById('files-input');
      const files = Array.from(filesInput.files);
      
      if (files.length === 0) {
        this.showError('Please select files');
        return;
      }

      close();
      await this.app.createArchive(files, format);
    });
  }

  /**
   * Show share dialog
   */
  showShareDialog(shareLink) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Share Link</h3>
          <button class="btn-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <p>Share this link with others:</p>
          <div class="share-link-container">
            <input type="text" id="share-link" value="${shareLink}" readonly class="form-control">
            <button id="btn-copy-link" class="btn">Copy</button>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-close-dialog" class="btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const close = () => {
      dialog.remove();
    };

    dialog.querySelector('#modal-close').addEventListener('click', close);
    dialog.querySelector('#btn-close-dialog').addEventListener('click', close);
    
    dialog.querySelector('#btn-copy-link').addEventListener('click', () => {
      const input = document.getElementById('share-link');
      input.select();
      document.execCommand('copy');
      this.showSuccess('Link copied to clipboard');
    });
  }

  /**
   * Filter files by search term
   */
  filterFiles(searchTerm) {
    const rows = document.querySelectorAll('.file-row.file');
    const term = searchTerm.toLowerCase();

    rows.forEach(row => {
      const name = row.querySelector('.name').textContent.toLowerCase();
      if (name.includes(term)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  /**
   * Refresh file list
   */
  refreshFileList() {
    if (this.app.currentArchive) {
      this.displayArchiveContents(this.app.currentArchive);
    }
  }

  /**
   * Update selection count
   */
  updateSelectionCount(count) {
    const selectionCount = document.getElementById('selection-count');
    const downloadBtn = document.getElementById('btn-download-selected');
    
    if (selectionCount) {
      selectionCount.textContent = count > 0 ? `${count} selected` : '';
    }
    
    if (downloadBtn) {
      downloadBtn.disabled = count === 0;
    }
  }

  /**
   * Update status text
   */
  updateStatus(message) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = message;
    }
  }

  /**
   * Show loading overlay
   */
  showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    
    if (overlay) {
      overlay.style.display = 'flex';
    }
    if (text) {
      text.textContent = message;
    }
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Get file icon based on extension
   */
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'txt': '📄',
      'pdf': '📕',
      'doc': '📘',
      'docx': '📘',
      'xls': '📗',
      'xlsx': '📗',
      'ppt': '📙',
      'pptx': '📙',
      'jpg': '🖼',
      'jpeg': '🖼',
      'png': '🖼',
      'gif': '🖼',
      'mp3': '🎵',
      'mp4': '🎬',
      'zip': '📦',
      'rar': '📦',
      '7z': '📦'
    };
    return iconMap[ext] || '📄';
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
