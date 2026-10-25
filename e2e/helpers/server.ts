// Plain HTTPS calls to the dev stack (self-signed certificate, basic auth enabled in the stack's
// .env). Uses node:https so multi-GiB uploads can stream from disk.
import { createReadStream, statSync } from 'node:fs'
import { request, RequestOptions } from 'node:https'
import { basename } from 'node:path'
import { BASE_URL, PASSWORD, USER } from '../env'

interface Response {
  status: number
  body: string
}

const call = (
  method: string,
  path: string,
  {
    body,
    headers = {}
  }: { body?: string | NodeJS.ReadableStream; headers?: Record<string, string | number> } = {}
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options: RequestOptions = {
      method,
      rejectUnauthorized: false,
      auth: `${USER}:${PASSWORD}`,
      headers: { 'OCS-APIRequest': 'true', ...headers }
    }
    const req = request(url, options, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
    })
    req.on('error', reject)
    if (body === undefined) {
      req.end()
    } else if (typeof body === 'string') {
      req.end(body)
    } else {
      body.pipe(req)
    }
  })

const davPath = (name: string) => `/remote.php/webdav/${encodeURIComponent(name)}`

export const getJson = async <T>(path: string): Promise<T> => {
  const { status, body } = await call('GET', path)
  if (status !== 200) {
    throw new Error(`GET ${path} → ${status}`)
  }
  return JSON.parse(body) as T
}

/** Uploads (or overwrites) a local file into the user's home folder. */
export const upload = async (file: string, name = basename(file)) => {
  const { status } = await call('PUT', davPath(name), {
    body: createReadStream(file),
    headers: { 'Content-Length': statSync(file).size }
  })
  if (status !== 201 && status !== 204) {
    throw new Error(`Upload of ${name} failed with HTTP ${status}`)
  }
}

export const exists = async (name: string) =>
  (await call('PROPFIND', davPath(name), { headers: { Depth: 0 } })).status === 207

/** Items in the personal space's trash bin: DAV href and original file name. */
export const trashItems = async (): Promise<{ href: string; name: string }[]> => {
  const drives = await getJson<{ value: { id: string }[] }>(
    '/graph/v1.0/me/drives?$filter=driveType%20eq%20personal'
  )
  const trash = await call('PROPFIND', `/remote.php/dav/spaces/trash-bin/${drives.value[0].id}`, {
    headers: { Depth: 1 }
  })
  return trash.body
    .split('<d:response>')
    .slice(1)
    .flatMap((response) => {
      const href = /<d:href>(.*?)<\/d:href>/.exec(response)?.[1]
      const name = /<oc:trashbin-original-filename>(.*?)</.exec(response)?.[1]
      return href && name ? [{ href, name }] : []
    })
}

/** Deletes a file and removes it from the trash bin too. */
export const removeCompletely = async (name: string) => {
  const { status } = await call('DELETE', davPath(name))
  if (status !== 204 && status !== 404) {
    throw new Error(`Delete of ${name} failed with HTTP ${status}`)
  }
  for (const item of await trashItems()) {
    if (item.name === name) {
      await call('DELETE', item.href)
    }
  }
}

/** Sets the signed-in user's UI language (OpenCloud account setting). */
export const setLanguage = async (language: string) => {
  const { status } = await call('PATCH', '/graph/v1.0/me', {
    body: JSON.stringify({ preferredLanguage: language }),
    headers: { 'Content-Type': 'application/json' }
  })
  if (status !== 200 && status !== 204) {
    throw new Error(`Setting the language to ${language} failed with HTTP ${status}`)
  }
}
