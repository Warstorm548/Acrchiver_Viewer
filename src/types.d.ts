declare module 'libarchive.js/main.js' {
  export interface ArchiveFile {
    name: string
    size: number
    compressed?: number
    lastModified?: number
    mode?: number
  }

  export interface ArchiveEntry {
    file: ArchiveFile
  }

  export enum ArchiveFormat {
    ZIP = 'zip',
    TAR = 'tar',
    USTAR = 'ustar',
    PAX = 'pax',
    CPIO = 'cpio',
    SHAR = 'shar',
    ISO9660 = 'iso',
    '7ZIP' = '7zip',
    RAR = 'rar'
  }

  export enum ArchiveCompression {
    NONE = 'none',
    GZIP = 'gzip',
    BZIP2 = 'bzip2',
    COMPRESS = 'compress',
    LZMA = 'lzma',
    XZ = 'xz',
    UU = 'uu',
    LZIP = 'lzip',
    LRZIP = 'lrzip',
    LZOP = 'lzop',
    GRZIP = 'grzip',
    LZ4 = 'lz4',
    ZSTD = 'zstd'
  }

  export interface WriteOptions {
    files: Array<{
      file: Blob | File
      pathname: string
    }>
    outputFileName: string
    compression?: ArchiveCompression
    format?: ArchiveFormat
    passphrase?: string | null
  }

  export class Archive {
    static init(config?: { workerUrl?: string }): void
    static open(file: File | Blob): Promise<Archive>
    static write(options: WriteOptions): Promise<File>
    static extract(file: ArchiveFile): Promise<Uint8Array>
    
    getFilesArray(): Promise<ArchiveEntry[]>
    extractFiles(filter?: (entry: ArchiveEntry) => boolean): Promise<Map<string, Uint8Array>>
    close(): void
  }
}

declare module '@opencloud-eu/web-pkg' {
  import { Component } from 'vue'
  import { RouteRecordRaw } from 'vue-router'

  export interface Resource {
    id: string
    fileId: string
    name: string
    path: string
    type: string
    mimeType?: string
    size: number
    mdate?: string
    etag?: string
    driveAlias?: string
    driveType?: string
    webDavPath?: string
  }

  export interface Space {
    id: string
    driveAlias: string
    driveType: string
    name: string
    quota?: {
      used: number
      total: number
    }
  }

  export interface ApplicationFileExtension {
    extension: string
    name: string
    mimeType?: string | string[]
    canBeDefault?: boolean
    handler: (context: {
      space: Space
      resource: Resource
    }) => Promise<{
      app: string
      route: {
        name: string
        params?: Record<string, any>
        query?: Record<string, any>
      }
    }>
  }

  export interface AppInfo {
    name: string
    id: string
    icon?: string
    color?: string
    defaultExtension?: string
    extensions?: string[]
  }

  export interface WebApplication {
    appInfo: AppInfo
    extensions?: ApplicationFileExtension[]
    routes?: RouteRecordRaw[]
    navItems?: any[]
    translations?: Record<string, Record<string, string>>
  }

  export function defineWebApplication(config: {
    setup: (context: { applicationConfig: any }) => WebApplication
  }): any

  export function useClientService(): {
    webdav: {
      getFileContents(resource: Resource): Promise<Response>
      getFileInfo(path: string): Promise<Resource>
    }
  }

  export function useResourcesStore(): {
    getResource(id: string): Resource | undefined
    resources: Resource[]
  }

  export function useLoadingService(): {
    addTask(): void
    removeTask(): void
    isLoading: boolean
  }

  export const $gettext: (text: string) => string
}

declare module '@opencloud-eu/extension-sdk' {
  import { UserConfig } from 'vite'
  
  export const defaultConfig: UserConfig
}
