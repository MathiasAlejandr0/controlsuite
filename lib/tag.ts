import type { Project, ProjectTag } from './types'

const HOME_HINT = /\\users\\|\/users\/|\\documents\\|\\desktop\\|\\downloads\\|\\onedrive\\/i

export function inferProjectTag(localPath: string): ProjectTag {
  return HOME_HINT.test(localPath.replace(/\//g, '\\')) ? 'casa' : 'trabajo'
}

export function projectTag(project: Pick<Project, 'tag' | 'localPath'>): ProjectTag {
  return project.tag ?? inferProjectTag(project.localPath)
}

export function tagLabel(tag: ProjectTag) {
  return tag === 'casa' ? 'Casa' : 'Trabajo'
}
