import { BadRequestException } from '@nestjs/common';
import type { Session } from '@prisma/client';
import { MessageRepository } from '@/database/repositories/message.repository';
import { SessionRepository } from '@/database/repositories/session.repository';
import { ReposService } from '@/repos/repos.service';
import { SessionsService } from '@/sessions/sessions.service';

const row: Session = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  githubUrl: 'https://github.com/owner/repo',
  repoOwner: 'owner',
  repoName: 'repo',
  repoPath: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('SessionsService.create', () => {
  const build = (clone: () => Promise<string>) => {
    const sessions = {
      create: jest.fn(() => Promise.resolve(row)),
      delete: jest.fn(() => Promise.resolve()),
      updateRepoPath: jest.fn((_id: string, repoPath: string) =>
        Promise.resolve({ ...row, repoPath }),
      ),
    };
    const repos = new ReposService();
    jest.spyOn(repos, 'clone').mockImplementation(clone);
    const service = new SessionsService(
      sessions as unknown as SessionRepository,
      {} as MessageRepository,
      repos,
    );
    return { service, sessions };
  };

  it('stores the checkout path once the repository is fetched', async () => {
    const { service, sessions } = build(() => Promise.resolve('/tmp/x'));

    const dto = await service.create({
      githubUrl: 'https://github.com/owner/repo',
    });

    expect(dto.repoName).toBe('repo');
    expect(sessions.updateRepoPath).toHaveBeenCalledWith(row.id, '/tmp/x');
    expect(sessions.delete).not.toHaveBeenCalled();
  });

  it('removes the session row when the repository cannot be fetched', async () => {
    const { service, sessions } = build(() =>
      Promise.reject(new BadRequestException('404 Not Found')),
    );

    await expect(
      service.create({ githubUrl: 'https://github.com/owner/repo' }),
    ).rejects.toThrow('404 Not Found');
    expect(sessions.delete).toHaveBeenCalledWith(row.id);
    expect(sessions.updateRepoPath).not.toHaveBeenCalled();
  });
});
