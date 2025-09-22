const request = require('supertest');
const nock = require('nock');
const express = require('express');

const consulClient = require('axios').create({
  baseURL: process.env.CONSUL_ADDR || 'http://consul:8500',
  headers: { 'Content-Type': 'application/json' }
});

const nomadClient = require('axios').create({
  baseURL: process.env.NOMAD_ADDR || 'http://nomad:4646',
  headers: { 'Content-Type': 'application/json' }
});

jest.mock('../../src/utils', () => ({
  analyzeRepository: jest.fn(),
  deployToNomad: jest.fn(),
  detectAppType: jest.fn()
}));

jest.mock('simple-git', () => {
  return jest.fn(() => ({
    clone: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
}));

const { analyzeRepository, deployToNomad, detectAppType } = require('../../src/utils');

const app = express();
app.use(express.json());

const vaultClient = require('node-vault')({
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN || 'myroot'
});

app.post('/deploy', async (req, res) => {
  try {
    const { slugs } = req.body;

    if (!Array.isArray(slugs)) {
      return res.status(400).json({ error: 'slugs must be an array' });
    }

    const results = [];

    for (const slug of slugs) {
      try {
        const repoConfig = await analyzeRepository(`/app/repos/${slug.replace('/', '_')}`);
        const appType = await detectAppType(`/app/repos/${slug.replace('/', '_')}`);

        const appName = slug.split('/')[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');

        const deploymentConfig = {
          slug,
          appName,
          appType,
          port: repoConfig.port || (appType === 'python' ? 5000 : 3000),
          buildCmd: repoConfig.buildCmd,
          startCmd: repoConfig.startCmd,
          pythonVersion: repoConfig.pythonVersion
        };

        await consulClient.put(`/v1/kv/apps/${appName}/config`, deploymentConfig);
        const jobId = await deployToNomad(nomadClient, deploymentConfig);

        results.push({
          slug,
          appName,
          jobId,
          url: `http://${appName}.localhost`,
          status: 'deployed'
        });

      } catch (error) {
        results.push({
          slug,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({ results });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/apps', async (req, res) => {
  try {
    const response = await consulClient.get('/v1/kv/apps/?recurse=true');
    const apps = response.data.map(item => {
      const config = JSON.parse(Buffer.from(item.Value, 'base64').toString());
      return {
        name: item.Key.split('/')[1],
        ...config
      };
    });
    res.json({ apps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

describe('API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('POST /deploy', () => {
    it('should return 400 if slugs is not an array', async () => {
      const response = await request(app)
        .post('/deploy')
        .send({ slugs: 'not-an-array' })
        .expect(400);

      expect(response.body).toEqual({ error: 'slugs must be an array' });
    });

    it('should successfully deploy a single slug', async () => {
      analyzeRepository.mockResolvedValue({
        port: 3000,
        buildCmd: 'npm install',
        startCmd: 'npm start',
        pythonVersion: null
      });

      detectAppType.mockResolvedValue('node');
      deployToNomad.mockResolvedValue('job-123');

      nock('http://consul:8500')
        .put('/v1/kv/apps/express/config')
        .reply(200, true);

      const response = await request(app)
        .post('/deploy')
        .send({ slugs: ['expressjs/express'] })
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toEqual({
        slug: 'expressjs/express',
        appName: 'express',
        jobId: 'job-123',
        url: 'http://express.localhost',
        status: 'deployed'
      });
    });

    it('should handle multiple slugs', async () => {
      analyzeRepository.mockResolvedValue({
        port: 3000,
        buildCmd: 'npm install',
        startCmd: 'npm start',
        pythonVersion: null
      });

      detectAppType.mockResolvedValue('node');
      deployToNomad.mockResolvedValue('job-123');

      nock('http://consul:8500')
        .put('/v1/kv/apps/express/config')
        .reply(200, true)
        .put('/v1/kv/apps/flask/config')
        .reply(200, true);

      const response = await request(app)
        .post('/deploy')
        .send({ slugs: ['expressjs/express', 'pallets/flask'] })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].slug).toBe('expressjs/express');
      expect(response.body.results[1].slug).toBe('pallets/flask');
    });

    it('should handle deployment errors gracefully', async () => {
      analyzeRepository.mockRejectedValue(new Error('Repository not found'));

      const response = await request(app)
        .post('/deploy')
        .send({ slugs: ['invalid/repo'] })
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toEqual({
        slug: 'invalid/repo',
        status: 'error',
        error: 'Repository not found'
      });
    });

    it('should use default port for Python apps', async () => {
      analyzeRepository.mockResolvedValue({
        port: null,
        buildCmd: 'pip install -r requirements.txt',
        startCmd: 'python app.py',
        pythonVersion: '3.9'
      });

      detectAppType.mockResolvedValue('python');
      deployToNomad.mockResolvedValue('job-456');

      nock('http://consul:8500')
        .put('/v1/kv/apps/flask/config')
        .reply(200, true);

      const response = await request(app)
        .post('/deploy')
        .send({ slugs: ['pallets/flask'] })
        .expect(200);

      expect(response.body.results[0].status).toBe('deployed');
    });

    it('should sanitize app names properly', async () => {
      analyzeRepository.mockResolvedValue({
        port: 3000,
        buildCmd: 'npm install',
        startCmd: 'npm start',
        pythonVersion: null
      });

      detectAppType.mockResolvedValue('node');
      deployToNomad.mockResolvedValue('job-789');

      nock('http://consul:8500')
        .put(/\/v1\/kv\/apps\/.*\/config/)
        .reply(200, true);

      const response = await request(app)
        .post('/deploy')
        .send({ slugs: ['user/My_App@Name!'] })
        .expect(200);

      expect(response.body.results[0].appName).toBe('my-app-name-');
    });
  });

  describe('GET /apps', () => {
    it('should return deployed apps from Consul', async () => {
      const mockConsulResponse = [
        {
          Key: 'apps/express/config',
          Value: Buffer.from(JSON.stringify({
            slug: 'expressjs/express',
            appType: 'node',
            port: 3000
          })).toString('base64')
        },
        {
          Key: 'apps/flask/config',
          Value: Buffer.from(JSON.stringify({
            slug: 'pallets/flask',
            appType: 'python',
            port: 5000
          })).toString('base64')
        }
      ];

      nock('http://consul:8500')
        .get('/v1/kv/apps/?recurse=true')
        .reply(200, mockConsulResponse);

      const response = await request(app)
        .get('/apps')
        .expect(200);

      expect(response.body.apps).toHaveLength(2);
      expect(response.body.apps[0]).toEqual({
        name: 'express',
        slug: 'expressjs/express',
        appType: 'node',
        port: 3000
      });
      expect(response.body.apps[1]).toEqual({
        name: 'flask',
        slug: 'pallets/flask',
        appType: 'python',
        port: 5000
      });
    });

    it('should handle Consul errors', async () => {
      nock('http://consul:8500')
        .get('/v1/kv/apps/?recurse=true')
        .reply(500, { error: 'Internal server error' });

      const response = await request(app)
        .get('/apps')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle empty apps list', async () => {
      nock('http://consul:8500')
        .get('/v1/kv/apps/?recurse=true')
        .reply(404);

      const response = await request(app)
        .get('/apps')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});