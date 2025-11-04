/**
 * Memory Management Utilities for Large Archive Processing
 * 
 * This module provides utilities for monitoring and managing memory
 * when working with very large archive files (20GB+)
 */

export interface MemoryStats {
  totalHeap: number
  usedHeap: number
  limit: number
  usage: number // percentage
}

export interface StreamConfig {
  chunkSize: number
  maxBufferSize: number
  gcThreshold: number // memory usage percentage to trigger GC
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  chunkSize: 64 * 1024 * 1024, // 64MB chunks
  maxBufferSize: 512 * 1024 * 1024, // 512MB max buffer
  gcThreshold: 0.75 // Trigger cleanup at 75% memory usage
}

/**
 * Check current memory usage (Chrome only)
 */
export function getMemoryStats(): MemoryStats | null {
  if ('memory' in performance && (performance as any).memory) {
    const mem = (performance as any).memory
    return {
      totalHeap: mem.totalJSHeapSize,
      usedHeap: mem.usedJSHeapSize,
      limit: mem.jsHeapSizeLimit,
      usage: mem.usedJSHeapSize / mem.jsHeapSizeLimit
    }
  }
  return null
}

/**
 * Estimate available memory
 */
export function getAvailableMemory(): number {
  const stats = getMemoryStats()
  if (stats) {
    return stats.limit - stats.usedHeap
  }
  // Conservative estimate if API not available
  return 2 * 1024 * 1024 * 1024 // 2GB
}

/**
 * Check if operation is safe given current memory and required size
 */
export function canAllocate(requiredBytes: number, safetyMargin = 1.5): boolean {
  const available = getAvailableMemory()
  const requiredWithMargin = requiredBytes * safetyMargin
  return requiredWithMargin < available
}

/**
 * Force garbage collection if available
 */
export function forceGC(): void {
  if (typeof global !== 'undefined' && 'gc' in global && typeof (global as any).gc === 'function') {
    try {
      (global as any).gc()
    } catch (e) {
      // GC not available
    }
  }
}

/**
 * Wait for garbage collection opportunity
 */
export async function waitForGC(minDelay = 100): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, minDelay))
  forceGC()
  await new Promise(resolve => setTimeout(resolve, 10))
}

/**
 * Process large array in chunks to avoid blocking
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T, index: number) => R | Promise<R>,
  chunkSize = 100
): Promise<R[]> {
  const results: R[] = []
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    
    for (let j = 0; j < chunk.length; j++) {
      const result = await processor(chunk[j], i + j)
      results.push(result)
    }
    
    // Yield to event loop between chunks
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Check memory and cleanup if needed
    const stats = getMemoryStats()
    if (stats && stats.usage > DEFAULT_STREAM_CONFIG.gcThreshold) {
      await waitForGC(50)
    }
  }
  
  return results
}

/**
 * Create a readable stream from chunks with automatic memory management
 */
export class ManagedStream {
  private chunks: Uint8Array[] = []
  private totalSize = 0
  private maxBufferSize: number
  
  constructor(maxBufferSize = DEFAULT_STREAM_CONFIG.maxBufferSize) {
    this.maxBufferSize = maxBufferSize
  }
  
  async addChunk(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk)
    this.totalSize += chunk.length
    
    // If buffer is getting too large, trigger cleanup
    if (this.totalSize > this.maxBufferSize) {
      await this.flush()
    }
  }
  
  async flush(): Promise<Uint8Array | null> {
    if (this.chunks.length === 0) return null
    
    // Combine chunks
    const combined = new Uint8Array(this.totalSize)
    let offset = 0
    
    for (const chunk of this.chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    
    // Clear chunks and reset
    this.chunks = []
    this.totalSize = 0
    
    // Trigger GC
    await waitForGC()
    
    return combined
  }
  
  getSize(): number {
    return this.totalSize
  }
  
  clear(): void {
    this.chunks = []
    this.totalSize = 0
  }
}

/**
 * Read file in chunks with progress callback
 */
export async function readFileInChunks(
  file: File | Blob,
  onChunk: (chunk: Uint8Array, progress: number) => void | Promise<void>,
  chunkSize = DEFAULT_STREAM_CONFIG.chunkSize
): Promise<void> {
  const totalSize = file.size
  let offset = 0
  
  while (offset < totalSize) {
    const end = Math.min(offset + chunkSize, totalSize)
    const slice = file.slice(offset, end)
    const arrayBuffer = await slice.arrayBuffer()
    const chunk = new Uint8Array(arrayBuffer)
    
    const progress = (end / totalSize) * 100
    await onChunk(chunk, progress)
    
    offset = end
    
    // Yield to event loop
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Check memory
    const stats = getMemoryStats()
    if (stats && stats.usage > DEFAULT_STREAM_CONFIG.gcThreshold) {
      await waitForGC(50)
    }
  }
}

/**
 * Download large blob in chunks to avoid memory issues
 */
export async function downloadLargeBlob(
  blob: Blob,
  filename: string,
  chunkSize = 100 * 1024 * 1024 // 100MB chunks
): Promise<void> {
  if (blob.size < chunkSize) {
    // Small file, direct download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  
  // Large file, use chunks
  const chunks: Uint8Array[] = []
  let offset = 0
  
  while (offset < blob.size) {
    const end = Math.min(offset + chunkSize, blob.size)
    const slice = blob.slice(offset, end)
    const arrayBuffer = await slice.arrayBuffer()
    chunks.push(new Uint8Array(arrayBuffer))
    offset = end
    
    // Yield
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  // Create final blob
  const finalBlob = new Blob(chunks)
  const url = URL.createObjectURL(finalBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  
  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url)
    chunks.length = 0
    waitForGC()
  }, 1000)
}

/**
 * Monitor memory usage and emit warnings
 */
export class MemoryMonitor {
  private interval: number | null = null
  private listeners: Array<(stats: MemoryStats) => void> = []
  private warningThreshold: number
  
  constructor(warningThreshold = 0.7, checkInterval = 5000) {
    this.warningThreshold = warningThreshold
    this.start(checkInterval)
  }
  
  start(interval = 5000): void {
    this.stop()
    
    this.interval = window.setInterval(() => {
      const stats = getMemoryStats()
      if (stats) {
        this.listeners.forEach(listener => listener(stats))
        
        if (stats.usage > this.warningThreshold) {
          console.warn(`High memory usage: ${(stats.usage * 100).toFixed(1)}%`)
        }
      }
    }, interval)
  }
  
  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
  
  onUpdate(listener: (stats: MemoryStats) => void): () => void {
    this.listeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }
  
  destroy(): void {
    this.stop()
    this.listeners = []
  }
}

/**
 * Utility to estimate archive extraction memory requirements
 */
export function estimateExtractionMemory(
  compressedSize: number,
  compressionRatio = 0.5
): number {
  // Estimate: compressed size * (1 / compression ratio) * overhead
  const uncompressedSize = compressedSize / compressionRatio
  const overhead = 1.5 // 50% overhead for processing
  return uncompressedSize * overhead
}

/**
 * Check if browser supports streaming APIs
 */
export function supportsStreaming(): boolean {
  return (
    'ReadableStream' in window &&
    'WritableStream' in window &&
    'TransformStream' in window
  )
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default {
  getMemoryStats,
  getAvailableMemory,
  canAllocate,
  forceGC,
  waitForGC,
  processInChunks,
  ManagedStream,
  readFileInChunks,
  downloadLargeBlob,
  MemoryMonitor,
  estimateExtractionMemory,
  supportsStreaming,
  formatBytes,
  DEFAULT_STREAM_CONFIG
}
