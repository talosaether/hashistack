const { execSync, spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '../..');
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'test-minimal.yml');
const TIMEOUT = 60000;

describe('Docker Infrastructure Tests', () => {
  let composeProcess;

  beforeAll(async () => {
    console.log('Starting test infrastructure...');

    try {
      execSync(`docker compose -f ${COMPOSE_FILE} down -v`, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
      });
    } catch (error) {
      console.log('No existing containers to stop');
    }

    execSync(`docker compose -f ${COMPOSE_FILE} up -d`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    await waitForServices();
  }, TIMEOUT);

  afterAll(async () => {
    console.log('Stopping test infrastructure...');
    try {
      execSync(`docker compose -f ${COMPOSE_FILE} down -v`, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
      });
    } catch (error) {
      console.error('Error stopping containers:', error.message);
    }
  }, 30000);

  async function waitForServices() {
    const services = [
      { name: 'Consul', url: 'http://localhost:8510/v1/status/leader', retries: 30 },
      { name: 'Vault', url: 'http://localhost:8210/v1/sys/health', retries: 30 },
      { name: 'Slug Processor', url: 'http://localhost:3010/health', retries: 30 }
    ];

    for (const service of services) {
      console.log(`Waiting for ${service.name}...`);
      await waitForService(service.url, service.retries);
      console.log(`${service.name} is ready`);
    }
  }

  async function waitForService(url, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await axios.get(url, { timeout: 5000 });
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`Service at ${url} failed to start after ${maxRetries} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  describe('Container Health', () => {
    it('should have all containers running', () => {
      const output = execSync(`docker compose -f ${COMPOSE_FILE} ps --format json`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });

      const containers = output.trim().split('\n').map(line => JSON.parse(line));

      expect(containers).toHaveLength(3);

      const expectedContainers = ['consul-test', 'vault-test', 'slug-processor-test'];
      expectedContainers.forEach(containerName => {
        const container = containers.find(c => c.Name === containerName);
        expect(container).toBeDefined();
        expect(container.State).toBe('running');
      });
    });

    it('should have all containers with healthy status', async () => {
      const services = [
        { name: 'consul-test', healthCheck: () => axios.get('http://localhost:8510/v1/status/leader') },
        { name: 'vault-test', healthCheck: () => axios.get('http://localhost:8210/v1/sys/health') },
        { name: 'slug-processor-test', healthCheck: () => axios.get('http://localhost:3010/health') }
      ];

      for (const service of services) {
        const response = await service.healthCheck();
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Service Connectivity', () => {
    it('should verify Consul API accessibility', async () => {
      const response = await axios.get('http://localhost:8510/v1/status/peers');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should verify Vault API accessibility', async () => {
      const response = await axios.get('http://localhost:8210/v1/sys/health');
      expect(response.status).toBe(200);
      expect(response.data.initialized).toBe(true);
      expect(response.data.sealed).toBe(false);
    });

    it('should verify slug processor API accessibility', async () => {
      const response = await axios.get('http://localhost:3010/health');
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    });
  });

  describe('Network Configuration', () => {
    it('should verify port mappings are correct', () => {
      const output = execSync(`docker compose -f ${COMPOSE_FILE} ps --format json`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });

      const containers = output.trim().split('\n').map(line => JSON.parse(line));

      const expectedPorts = {
        'consul-test': '8510:8500/tcp',
        'vault-test': '8210:8200/tcp',
        'slug-processor-test': '3010:3000/tcp'
      };

      Object.entries(expectedPorts).forEach(([containerName, expectedPort]) => {
        const container = containers.find(c => c.Name === containerName);
        expect(container).toBeDefined();
        expect(container.Publishers).toContainEqual(
          expect.objectContaining({
            PublishedPort: parseInt(expectedPort.split(':')[0]),
            TargetPort: parseInt(expectedPort.split(':')[1].split('/')[0])
          })
        );
      });
    });
  });

  describe('Environment Variables', () => {
    it('should verify Vault has correct environment variables', async () => {
      const output = execSync('docker inspect vault-test', {
        encoding: 'utf8'
      });

      const containerInfo = JSON.parse(output)[0];
      const envVars = containerInfo.Config.Env;

      expect(envVars).toContain('VAULT_DEV_ROOT_TOKEN_ID=myroot');
    });

    it('should verify slug processor has correct environment variables', async () => {
      const output = execSync('docker inspect slug-processor-test', {
        encoding: 'utf8'
      });

      const containerInfo = JSON.parse(output)[0];
      const envVars = containerInfo.Config.Env;

      const expectedEnvVars = [
        'CONSUL_ADDR=http://consul:8500',
        'VAULT_ADDR=http://vault:8200',
        'VAULT_TOKEN=myroot'
      ];

      expectedEnvVars.forEach(expectedEnv => {
        expect(envVars).toContain(expectedEnv);
      });
    });
  });

  describe('Volume Mounts', () => {
    it('should verify containers have no persistent volumes in test setup', () => {
      const output = execSync(`docker compose -f ${COMPOSE_FILE} ps --format json`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });

      const containers = output.trim().split('\n').map(line => JSON.parse(line));

      containers.forEach(container => {
        if (container.Name === 'slug-processor-test') {
          return;
        }

        const inspect = execSync(`docker inspect ${container.Name}`, {
          encoding: 'utf8'
        });

        const containerInfo = JSON.parse(inspect)[0];
        const mounts = containerInfo.Mounts || [];

        const persistentMounts = mounts.filter(mount =>
          mount.Type === 'volume' && !mount.Source.includes('tmp')
        );

        expect(persistentMounts).toHaveLength(0);
      });
    });
  });

  describe('Container Logs', () => {
    it('should verify containers are logging properly', async () => {
      const containers = ['consul-test', 'vault-test', 'slug-processor-test'];

      for (const container of containers) {
        const logs = execSync(`docker logs ${container} --tail 50`, {
          encoding: 'utf8'
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs).not.toContain('fatal');
        expect(logs).not.toContain('FATAL');
      }
    });

    it('should verify slug processor startup message', () => {
      const logs = execSync('docker logs slug-processor-test', {
        encoding: 'utf8'
      });

      expect(logs).toContain('Slug processor running on port 3000');
    });
  });

  describe('Resource Usage', () => {
    it('should verify containers are not using excessive resources', async () => {
      const stats = execSync('docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"', {
        encoding: 'utf8'
      });

      const lines = stats.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);

      lines.slice(1).forEach(line => {
        const [name, cpu, memory] = line.split('\t');
        if (name.includes('test')) {
          const cpuPercent = parseFloat(cpu.replace('%', ''));
          expect(cpuPercent).toBeLessThan(50);

          const memoryMatch = memory.match(/(\d+(?:\.\d+)?)\w+\s*\/\s*(\d+(?:\.\d+)?)\w+/);
          if (memoryMatch) {
            const [, used, total] = memoryMatch;
            const memoryPercent = (parseFloat(used) / parseFloat(total)) * 100;
            expect(memoryPercent).toBeLessThan(80);
          }
        }
      });
    });
  });
});