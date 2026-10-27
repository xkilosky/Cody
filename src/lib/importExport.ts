import type { Project, ProjectFile } from '../types'
import { createZip } from './zip'
import { normalizePath, projectMetaOf, slugify, uid } from './utils'

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|wav|pdf|zip|wasm)$/i

export async function filesFromFileList(list: FileList | File[]): Promise<ProjectFile[]> {
  const files: ProjectFile[] = []
  for (const file of Array.from(list)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = normalizePath(relative && relative.length > 0 ? relative : file.name)
    if (!path || path.startsWith('.git/') || path.includes('/node_modules/')) continue
    if (BINARY_EXT.test(path)) continue
    if (file.size > 512 * 1024) continue
    const text = await file.text()
    files.push({ path, content: text })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export function projectToJson(project: Project): string {
  return JSON.stringify(
    {
      format: 'cody-project',
      version: 1,
      ...project,
    },
    null,
    2,
  )
}

export function projectFromJson(text: string, fallbackName = 'Imported project'): Project | null {
  try {
    const data = JSON.parse(text) as Partial<Project> & { files?: Array<Partial<ProjectFile>> }
    if (!data || !Array.isArray(data.files)) return null
    const files: ProjectFile[] = data.files
      .filter((file): file is ProjectFile => typeof file?.path === 'string' && typeof file.content === 'string')
      .map((file) => ({ path: normalizePath(file.path), content: file.content }))
    if (files.length === 0) return null
    const now = Date.now()
    const folders = Array.isArray(data.folders)
      ? [...new Set((data.folders as unknown[]).filter((f): f is string => typeof f === 'string').map(normalizePath).filter(Boolean))]
      : []
    return {
      id: uid('p_'),
      name: data.name || fallbackName,
      folders,
      description: data.description,
      entry: data.entry && files.some((f) => f.path === data.entry) ? data.entry : files[0].path,
      templateId: data.templateId,
      files,
      createdAt: now,
      updatedAt: now,
    }
  } catch {
    return null
  }
}

export function projectZipBlob(project: Project): Blob {
  const slug = slugify(project.name)
  const files = project.files.map((file) => ({ path: `${slug}/${file.path}`, content: file.content }))
  const readme = project.files.some((file) => file.path.toLowerCase() === 'readme.md')
  if (!readme) {
    files.unshift({
      path: `${slug}/README.md`,
      content: `# ${project.name}\n\n${project.description ?? 'Created with Cody — the mobile-first project editor.'}\n\nFiles:\n${project.files
        .map((file) => `- \`${file.path}\``)
        .join('\n')}\n`,
    })
  }
  return createZip(files)
}

export function projectSummary(project: Project) {
  const meta = projectMetaOf(project)
  const languages = [...new Set(project.files.map((file) => file.path.split('.').pop() ?? ''))]
  return { ...meta, extensions: languages }
}

export async function shareProject(project: Project): Promise<boolean> {
  const blob = projectZipBlob(project)
  const file = new File([blob], `${slugify(project.name)}.zip`, { type: 'application/zip' })
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: project.name, text: 'Made with Cody' })
      return true
    } catch {
      return false
    }
  }
  return false
}
