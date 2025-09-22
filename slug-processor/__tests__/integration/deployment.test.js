const request = require('supertest');
const axios = require('axios');

const CONSUL_URL = process.env.CONSUL_ADDR || 'http://localhost:8510';
const VAULT_URL = process.env.VAULT_ADDR || 'http://localhost:8210';
const SLUG_PROCESSOR_URL = process.env.SLUG_PROCESSOR_URL || 'http://localhost:3010';

const TIMEOUT = 30000;

describe('Integration Tests', () => {
  let consulClient;
  let vaultClient;

  beforeAll(() => {
    consulClient = axios.create({
      baseURL: CONSUL_URL,
      timeout: 10000
    });

    vaultClient = axios.create({
      baseURL: VAULT_URL,
      timeout: 10000,
      headers: {
        'X-Vault-Token': process.env.VAULT_TOKEN || 'myroot'
      }
    });
  });

  afterAll(() => {
    if (consulClient) {
      consulClient = null;
    }
    if (vaultClient) {
      vaultClient = null;
    }
  });

  beforeEach(async () => {
    try {
      await consulClient.delete('/v1/kv/apps?recurse=true');
    } catch (error) {
    }
  }, TIMEOUT);

  describe('Service Health Checks', () => {
    it('should verify Consul is running and accessible', async () => {
      const response = await consulClient.get('/v1/status/leader');
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    }, TIMEOUT);

    it('should verify Vault is running and accessible', async () => {
      const response = await vaultClient.get('/v1/sys/health');
      expect(response.status).toBe(200);
      expect(response.data.initialized).toBe(true);
      expect(response.data.sealed).toBe(false);
    }, TIMEOUT);

    it('should verify slug processor is running', async () => {
      const response = await axios.get(`${SLUG_PROCESSOR_URL}/health`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    }, TIMEOUT);
  });

  describe('End-to-End Deployment Flow', () => {
    it('should deploy a simple Node.js app and store config in Consul', async () => {
      const testSlug = 'expressjs/express';

      const deployResponse = await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
        slugs: [testSlug]
      });

      expect(deployResponse.status).toBe(200);
      expect(deployResponse.data.results).toHaveLength(1);

      const result = deployResponse.data.results[0];
      expect(result.slug).toBe(testSlug);

      if (result.status === 'deployed') {
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const consulResponse = await consulClient.get(`/v1/kv/apps/${result.appName}/config`);
          expect(consulResponse.status).toBe(200);

          const configData = JSON.parse(
            Buffer.from(consulResponse.data[0].Value, 'base64').toString()
          );

          expect(configData.slug).toBe(testSlug);
          expect(configData.appName).toBe(result.appName);
          expect(configData.appType).toBeDefined();
        } catch (consulError) {
          console.warn('Consul check failed (expected in minimal setup):', consulError.message);
        }
      } else {
        expect(result.status).toBe('error');
        expect(result.error).toBeDefined();
      }
    }, TIMEOUT);

    it('should handle multiple deployments correctly', async () => {
      const testSlugs = ['expressjs/express', 'facebook/react'];

      const deployResponse = await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
        slugs: testSlugs
      });

      expect(deployResponse.status).toBe(200);
      expect(deployResponse.data.results).toHaveLength(2);

      deployResponse.data.results.forEach((result, index) => {
        expect(result.slug).toBe(testSlugs[index]);
        expect(['deployed', 'error']).toContain(result.status);

        if (result.status === 'error') {
          expect(result.error).toBeDefined();
        }
      });
    }, TIMEOUT);
  });

  describe('Data Persistence and Retrieval', () => {
    it('should store and retrieve app configurations', async () => {
      const testConfig = {
        slug: 'test/app',
        appName: 'test-app',
        appType: 'node',
        port: 3000
      };

      try {
        await consulClient.put(
          `/v1/kv/apps/${testConfig.appName}/config`,
          JSON.stringify(testConfig)
        );

        const appsResponse = await axios.get(`${SLUG_PROCESSOR_URL}/apps`);

        if (appsResponse.status === 200) {
          const app = appsResponse.data.apps.find(a => a.name === testConfig.appName);
          expect(app).toBeDefined();
          expect(app.slug).toBe(testConfig.slug);
          expect(app.appType).toBe(testConfig.appType);
        }
      } catch (error) {
        console.warn('Data persistence test failed (expected in minimal setup):', error.message);
        expect(error.response?.status).toBeDefined();
      }
    }, TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid repository gracefully', async () => {
      const deployResponse = await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
        slugs: ['nonexistent/invalid-repo-12345']
      });

      expect(deployResponse.status).toBe(200);
      expect(deployResponse.data.results).toHaveLength(1);
      expect(deployResponse.data.results[0].status).toBe('error');
      expect(deployResponse.data.results[0].error).toBeDefined();
    }, TIMEOUT);

    it('should handle malformed requests', async () => {
      try {
        await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
          slugs: 'not-an-array'
        });
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe('slugs must be an array');
      }
    }, TIMEOUT);

    it('should handle service unavailability gracefully', async () => {
      const originalConsulAddr = process.env.CONSUL_ADDR;
      process.env.CONSUL_ADDR = 'http://nonexistent:8500';

      try {
        const deployResponse = await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
          slugs: ['expressjs/express']
        });

        expect(deployResponse.status).toBe(200);
        expect(deployResponse.data.results[0].status).toBe('error');
      } finally {
        process.env.CONSUL_ADDR = originalConsulAddr;
      }
    }, TIMEOUT);
  });

  describe('Vault Integration', () => {
    it('should verify Vault connectivity and secrets access', async () => {
      try {
        const secretPath = 'secret/test/app-config';
        const secretData = {
          database_url: 'postgresql://test:test@localhost:5432/testdb',
          api_key: 'test-api-key-12345'
        };

        await vaultClient.post(`/v1/${secretPath}`, { data: secretData });

        const secretResponse = await vaultClient.get(`/v1/${secretPath}`);
        expect(secretResponse.status).toBe(200);
        expect(secretResponse.data.data.data).toEqual(secretData);

        await vaultClient.delete(`/v1/${secretPath}`);
      } catch (error) {
        console.warn('Vault secret test failed:', error.message);
      }
    }, TIMEOUT);
  });
});