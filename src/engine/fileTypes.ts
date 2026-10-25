const textTypes: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  log: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  ini: 'text/plain',
  conf: 'text/plain',
  toml: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/plain',
  py: 'text/plain',
  sh: 'text/plain',
  sql: 'text/plain'
}

const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
}

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isTextFile = (name: string): boolean => extensionOf(name) in textTypes

export const isImageFile = (name: string): boolean => extensionOf(name) in imageTypes

export const mimeTypeFor = (name: string): string => {
  const extension = extensionOf(name)
  return textTypes[extension] ?? imageTypes[extension] ?? 'application/octet-stream'
}
