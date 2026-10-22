import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ReposService } from './repos.service';

jest.mock('@/shared/constants', () => ({
  ...jest.requireActual('@/shared/constants'),
  MAX_REPO_ARCHIVE_BYTES: 4096,
  MAX_REPO_EXPANDED_BYTES: 8192,
  MAX_REPO_ENTRIES: 3,
  REPO_DOWNLOAD_TIMEOUT_MS: 50,
}));

// A real gzip/tar stream exercises the limits on both sides of decompression.
function archive(files: Array<[string, string, string?]>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, contents, type = '0'] of files) {
    const data = Buffer.from(contents);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

describe('repository archive boundaries', () => {
  const service = new ReposService();
  const parsed = service.parseGithubUrl('https://github.com/example/project');
  let session: string;

  beforeEach(() => {
    session = `archive-test-${crypto.randomUUID()}`;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await service.remove(session);
  });

  function respond(bytes: Buffer) {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array(bytes)));
  }

  it('extracts an ordinary repository file', async () => {
    respond(archive([['repo-HEAD/README.md', '# Example']]));
    const target = await service.clone(session, parsed);
    expect(await readFile(join(target, 'README.md'), 'utf8')).toBe('# Example');
  });

  it('rejects a small compressed archive that expands past the limit', async () => {
    respond(archive([['repo-HEAD/bomb.txt', 'x'.repeat(16_384)]]));
    await expect(service.clone(session, parsed)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(existsSync(service.pathFor(session))).toBe(false);
  });

  it('rejects an oversized compressed response', async () => {
    respond(Buffer.alloc(4097));
    await expect(service.clone(session, parsed)).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(existsSync(service.pathFor(session))).toBe(false);
  });

  it('rejects too many entries and removes the partial directory', async () => {
    respond(archive([1, 2, 3, 4].map((i) => [`repo-HEAD/${i}.txt`, 'x'])));
    await expect(service.clone(session, parsed)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(existsSync(service.pathFor(session))).toBe(false);
  });

  it('removes a failed download', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(service.clone(session, parsed)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(existsSync(service.pathFor(session))).toBe(false);
  });

  it('bounds the response body as well as connection establishment', async () => {
    const body = new ReadableStream<Uint8Array>({ start() {} });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    await expect(service.clone(session, parsed)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(existsSync(service.pathFor(session))).toBe(false);
  });
});
