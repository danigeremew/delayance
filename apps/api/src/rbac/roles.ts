import { SetMetadata } from '@nestjs/common';
import type { ProjectRole } from '@delayance/shared-types';

export const PROJECT_ROLES_KEY = 'project_roles';

export const RequireProjectRoles = (...roles: ProjectRole[]) =>
  SetMetadata(PROJECT_ROLES_KEY, roles);

export const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  reviewer: 2,
  contributor: 3,
  editor: 4,
  owner: 5,
};

export function roleAtLeast(role: ProjectRole, minimum: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canRead(role: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.viewer;
}

export function canComment(role: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.reviewer;
}

export function canEditContent(role: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.contributor;
}

export function canManageProject(role: ProjectRole): boolean {
  return role === 'owner' || role === 'editor';
}

export function canManageMembers(role: ProjectRole): boolean {
  return role === 'owner';
}
