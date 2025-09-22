const fs = require('fs').promises;
const path = require('path');
const { analyzeRepository, detectAppType } = require('../../src/utils');

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    mkdir: jest.fn()
  }
}));

describe('Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectAppType', () => {
    it('should detect Node.js app when package.json exists', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectAppType('/test/path');
      expect(result).toBe('node');
    });

    it('should detect Python app when requirements.txt exists', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('requirements.txt')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectAppType('/test/path');
      expect(result).toBe('python');
    });

    it('should detect Go app when go.mod exists', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('go.mod')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectAppType('/test/path');
      expect(result).toBe('go');
    });

    it('should return unknown when no recognized files exist', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await detectAppType('/test/path');
      expect(result).toBe('unknown');
    });
  });

  describe('analyzeRepository', () => {
    it('should analyze Node.js repository with package.json', async () => {
      const mockPackageJson = {
        scripts: {
          build: 'npm run build',
          start: 'node server.js --port 8080'
        }
      };

      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await analyzeRepository('/test/path');

      expect(result).toEqual({
        port: null,
        buildCmd: 'npm run build',
        startCmd: 'npm start',
        pythonVersion: null
      });
    });

    it('should analyze Python repository with requirements.txt', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('requirements.txt')) {
          return Promise.resolve();
        }
        if (filePath.includes('runtime.txt')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('runtime.txt')) {
          return Promise.resolve('python-3.9.0');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzeRepository('/test/path');

      expect(result).toEqual({
        port: null,
        buildCmd: null,
        startCmd: null,
        pythonVersion: '3.9'
      });
    });

    it('should extract port from Dockerfile', async () => {
      const mockDockerfile = `
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]
      `;

      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('Dockerfile')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      fs.readFile.mockResolvedValue(mockDockerfile);

      const result = await analyzeRepository('/test/path');

      expect(result.port).toBe(3000);
    });

    it('should handle errors gracefully', async () => {
      fs.access.mockRejectedValue(new Error('Permission denied'));
      fs.readFile.mockRejectedValue(new Error('Read error'));

      const result = await analyzeRepository('/test/path');

      expect(result).toEqual({
        port: null,
        buildCmd: null,
        startCmd: null,
        pythonVersion: null
      });
    });

    it('should default to npm install when no build script exists', async () => {
      const mockPackageJson = {
        scripts: {
          start: 'node server.js'
        }
      };

      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await analyzeRepository('/test/path');

      expect(result.buildCmd).toBe('npm install');
    });

    it('should use dev script when no start script exists', async () => {
      const mockPackageJson = {
        scripts: {
          dev: 'nodemon app.js'
        }
      };

      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await analyzeRepository('/test/path');

      expect(result.startCmd).toBe('npm run dev');
    });
  });
});