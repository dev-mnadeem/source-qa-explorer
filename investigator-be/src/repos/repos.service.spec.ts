import { BadRequestException } from '@nestjs/common';
import { ReposService } from '@/repos/repos.service';

describe('ReposService.parseGithubUrl', () => {
  const service = new ReposService();

  it('parses a plain GitHub URL', () => {
    const parsed = service.parseGithubUrl('https://github.com/anthropics/claude-code');
    expect(parsed.owner).toBe('anthropics');
    expect(parsed.name).toBe('claude-code');
    expect(parsed.cloneUrl).toBe('https://github.com/anthropics/claude-code.git');
  });

  it('parses a URL with .git suffix', () => {
    const parsed = service.parseGithubUrl('https://github.com/owner/repo.git');
    expect(parsed.name).toBe('repo');
  });

  it('parses a URL with trailing slash', () => {
    const parsed = service.parseGithubUrl('https://github.com/owner/repo/');
    expect(parsed.name).toBe('repo');
  });

  it('rejects non-github urls', () => {
    expect(() => service.parseGithubUrl('https://gitlab.com/o/r')).toThrow(
      BadRequestException,
    );
  });

  it('rejects missing repo name', () => {
    expect(() => service.parseGithubUrl('https://github.com/owner')).toThrow(
      BadRequestException,
    );
  });

  it('rejects garbage', () => {
    expect(() => service.parseGithubUrl('not a url')).toThrow(BadRequestException);
  });
});
