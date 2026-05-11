import { Folder } from './folder.entity';

describe('Folder Entity', () => {
  describe('createRoot', () => {
    it('should create a root-level folder', () => {
      const folder = Folder.createRoot({
        name: 'Test Project',
        ownerId: 'user-1',
      });

      expect(folder.name).toBe('Test Project');
      expect(folder.ownerId).toBe('user-1');
      expect(folder.parentId).toBeNull();
      expect(folder.level).toBe(0);
      expect(folder.path).toContain('root/');
      expect(folder.version).toBe(1);
      expect(folder.featureCount).toBe(0);
    });

    it('should accept optional description and sortOrder', () => {
      const folder = Folder.createRoot({
        name: 'Project',
        ownerId: 'user-1',
        description: 'My project',
        sortOrder: 3,
      });

      expect(folder.description).toBe('My project');
      expect(folder.sortOrder).toBe(3);
    });
  });

  describe('createChild', () => {
    it('should create a child folder with correct path and level', () => {
      const parent = Folder.createRoot({ name: 'Parent', ownerId: 'user-1' });

      const child = Folder.createChild({
        name: 'Child',
        parentId: parent.id,
        parentPath: parent.path,
        parentLevel: parent.level,
        ownerId: 'user-1',
      });

      expect(child.name).toBe('Child');
      expect(child.parentId).toBe(parent.id);
      expect(child.level).toBe(1);
      expect(child.path).toBe(`${parent.path}/${child.id}`);
    });
  });

  describe('withName', () => {
    it('should return a new folder with updated name', () => {
      const folder = Folder.createRoot({ name: 'Old Name', ownerId: 'user-1' });
      const renamed = folder.withName('New Name');

      expect(renamed.name).toBe('New Name');
      expect(renamed.id).toBe(folder.id);
      expect(renamed.ownerId).toBe(folder.ownerId);
    });
  });

  describe('withParent', () => {
    it('should return a new folder with updated parent', () => {
      const root = Folder.createRoot({ name: 'Root', ownerId: 'user-1' });
      const child = Folder.createChild({
        name: 'Child',
        parentId: root.id,
        parentPath: root.path,
        parentLevel: root.level,
        ownerId: 'user-1',
      });

      const newParent = Folder.createRoot({
        name: 'New Parent',
        ownerId: 'user-1',
      });
      const moved = child.withParent(
        newParent.id,
        newParent.path,
        newParent.level,
      );

      expect(moved.parentId).toBe(newParent.id);
      expect(moved.path).toBe(`${newParent.path}/${child.id}`);
      expect(moved.level).toBe(newParent.level + 1);
    });

    it('should set level to 0 when moving to root', () => {
      const root = Folder.createRoot({ name: 'Root', ownerId: 'user-1' });
      const child = Folder.createChild({
        name: 'Child',
        parentId: root.id,
        parentPath: root.path,
        parentLevel: root.level,
        ownerId: 'user-1',
      });

      const movedToRoot = child.withParent(null, null, 0);
      expect(movedToRoot.parentId).toBeNull();
      expect(movedToRoot.level).toBe(0);
      expect(movedToRoot.path).toBe(`root/${child.id}`);
    });
  });

  describe('withIncrementedVersion', () => {
    it('should increment version by 1', () => {
      const folder = Folder.createRoot({ name: 'Test', ownerId: 'user-1' });
      expect(folder.version).toBe(1);

      const updated = folder.withIncrementedVersion();
      expect(updated.version).toBe(2);

      const updatedAgain = updated.withIncrementedVersion();
      expect(updatedAgain.version).toBe(3);
    });
  });
});
