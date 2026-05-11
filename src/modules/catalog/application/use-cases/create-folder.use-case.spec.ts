import { CreateFolderUseCase } from './create-folder.use-case';
import { Folder } from '../../domain/entities/folder.entity';

describe('CreateFolderUseCase', () => {
  let useCase: CreateFolderUseCase;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByNameAndParent: jest.fn(),
      create: jest.fn(),
    };
    useCase = new CreateFolderUseCase(mockRepo);
  });

  it('should create a root folder successfully', async () => {
    mockRepo.findByNameAndParent.mockResolvedValue(null);
    mockRepo.create.mockImplementation((folder: Folder) =>
      Promise.resolve(folder),
    );

    const result = await useCase.execute({ name: 'New Folder' }, 'user-1');

    expect(result.name).toBe('New Folder');
    expect(result.ownerId).toBe('user-1');
    expect(result.parentId).toBeNull();
    expect(result.level).toBe(0);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('should create a child folder successfully', async () => {
    const parent = Folder.createRoot({ name: 'Parent', ownerId: 'user-1' });
    mockRepo.findById.mockResolvedValue(parent);
    mockRepo.findByNameAndParent.mockResolvedValue(null);
    mockRepo.create.mockImplementation((folder: Folder) =>
      Promise.resolve(folder),
    );

    const result = await useCase.execute(
      { name: 'Child Folder', parentId: parent.id },
      'user-1',
    );

    expect(result.name).toBe('Child Folder');
    expect(result.parentId).toBe(parent.id);
    expect(result.level).toBe(1);
    expect(result.path).toContain(parent.path);
  });

  it('should reject duplicate folder name at root', async () => {
    const existing = Folder.createRoot({ name: 'Existing', ownerId: 'user-1' });
    mockRepo.findByNameAndParent.mockResolvedValue(existing);

    await expect(
      useCase.execute({ name: 'Existing' }, 'user-1'),
    ).rejects.toThrow('already exists');
  });

  it('should reject when parent folder does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ name: 'Child', parentId: 'nonexistent' }, 'user-1'),
    ).rejects.toThrow('Parent folder not found');
  });

  it('should reject when depth exceeds 10', async () => {
    const deepParent = new Folder({
      name: 'Deep',
      parentId: 'some-id',
      ownerId: 'user-1',
      path: 'root/a/b/c/d/e/f/g/h/i/j/k',
      level: 10,
    });
    mockRepo.findById.mockResolvedValue(deepParent);

    await expect(
      useCase.execute({ name: 'Too Deep', parentId: deepParent.id }, 'user-1'),
    ).rejects.toThrow('Maximum folder depth');
  });

  it('should accept optional description', async () => {
    mockRepo.findByNameAndParent.mockResolvedValue(null);
    mockRepo.create.mockImplementation((folder: Folder) =>
      Promise.resolve(folder),
    );

    const result = await useCase.execute(
      { name: 'Folder', description: 'A test folder' },
      'user-1',
    );

    expect(result.description).toBe('A test folder');
  });
});
