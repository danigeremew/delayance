import { describe, expect, it } from 'vitest';
import {
  ROLE_RANK,
  canComment,
  canEditContent,
  canManageMembers,
  roleAtLeast,
} from './roles';

describe('RBAC roles', () => {
  it('ranks owner above viewer', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.viewer);
    expect(roleAtLeast('editor', 'contributor')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
  });

  it('maps capabilities', () => {
    expect(canEditContent('contributor')).toBe(true);
    expect(canEditContent('viewer')).toBe(false);
    expect(canComment('reviewer')).toBe(true);
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('editor')).toBe(false);
  });
});
