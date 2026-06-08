import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { PrismaService } from '@/database/prisma.service';
import type { ProgressEvent } from '@/jobs/job.types';
import type { MessageDto } from '@/sessions/dto/message.dto';

/**
 * Runs the HTTP surface against a real Postgres (DATABASE_URL) with the
 * offline provider. The session is inserted directly and pointed at a copy of
 * the fixture repository, so no GitHub download is involved.
 */
describe('Codebase Investigator API (e2e)', () => {
  let app: INestApplication<App>;
  let checkout: string;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'fake';
    process.env.FAKE_LLM_DELAY_MS = '0';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    checkout = await mkdtemp(join(tmpdir(), 'e2e-checkout-'));
    await cp(join(__dirname, 'fixtures', 'sample-repo'), checkout, {
      recursive: true,
    });
  });

  afterAll(async () => {
    await app.close();
    await rm(checkout, { recursive: true, force: true });
  });

  it('reports a healthy database and the offline provider', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'up',
      llmProvider: 'fake',
      llmMode: 'offline',
    });
  });

  it('rejects a repository URL that is not on GitHub', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ githubUrl: 'https://gitlab.com/owner/repo' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields in the request body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ githubUrl: 'https://github.com/owner/repo', admin: true });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a session that does not exist', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/sessions/00000000-0000-4000-8000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  it('answers a question with verified citations and a verdict', async () => {
    const session = await app.get(PrismaService).session.create({
      data: {
        githubUrl: 'https://github.com/example/sample-repo',
        repoOwner: 'example',
        repoName: 'sample-repo',
        repoPath: checkout,
      },
    });
    const server = app.getHttpServer();

    const queued = await request(server)
      .post(`/api/sessions/${session.id}/messages`)
      .send({ content: 'How does the rateLimit bucket refill?' });
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({ status: 'queued' });
    const jobId = (queued.body as { id: string }).id;

    const stream = await request(server)
      .get(`/api/jobs/${jobId}/events`)
      .buffer(true)
      .parse((res, done) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        res.on('end', () => done(null, body));
      });
    const events = (stream.body as string)
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as ProgressEvent);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('started');
    expect(types).toContain('tool');
    expect(types[types.length - 1]).toBe('done');

    const job = await request(server).get(`/api/jobs/${jobId}`);
    expect(job.body).toMatchObject({ status: 'succeeded' });

    const messages = await request(server).get(
      `/api/sessions/${session.id}/messages`,
    );
    const [question, answer] = messages.body as MessageDto[];
    expect(question).toMatchObject({ role: 'user' });
    expect(answer.role).toBe('assistant');
    expect(answer.auditVerdict?.status).toBe('trusted');
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations.every((c) => c.verified)).toBe(true);
    expect(answer.citations[0].filePath).toContain('rateLimit.ts');
  });
});
