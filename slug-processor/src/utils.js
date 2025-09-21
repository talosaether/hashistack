const fs = require('fs').promises;
const path = require('path');

async function analyzeRepository(repoPath) {
  const config = {
    port: null,
    buildCmd: null,
    startCmd: null,
    pythonVersion: null
  };

  try {
    const packageJsonPath = path.join(repoPath, 'package.json');
    const packageJsonExists = await fs.access(packageJsonPath).then(() => true).catch(() => false);

    if (packageJsonExists) {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      if (packageJson.scripts) {
        if (packageJson.scripts.build) {
          config.buildCmd = 'npm run build';
        } else if (packageJson.scripts.install) {
          config.buildCmd = 'npm install';
        } else {
          config.buildCmd = 'npm install';
        }

        if (packageJson.scripts.start) {
          config.startCmd = 'npm start';
        } else if (packageJson.scripts.dev) {
          config.startCmd = 'npm run dev';
        }
      }

      const port = extractPortFromPackageJson(packageJson);
      if (port) config.port = port;
    }

    const requirementsPath = path.join(repoPath, 'requirements.txt');
    const requirementsExists = await fs.access(requirementsPath).then(() => true).catch(() => false);

    if (requirementsExists) {
      const pythonVersion = await detectPythonVersion(repoPath);
      if (pythonVersion) config.pythonVersion = pythonVersion;
    }

    const dockerfilePath = path.join(repoPath, 'Dockerfile');
    const dockerfileExists = await fs.access(dockerfilePath).then(() => true).catch(() => false);

    if (dockerfileExists) {
      const dockerfileContent = await fs.readFile(dockerfilePath, 'utf8');
      const exposedPort = extractPortFromDockerfile(dockerfileContent);
      if (exposedPort) config.port = exposedPort;
    }

  } catch (error) {
    console.error('Error analyzing repository:', error);
  }

  return config;
}

function detectAppType(repoPath) {
  return fs.access(path.join(repoPath, 'package.json'))
    .then(() => 'node')
    .catch(() => fs.access(path.join(repoPath, 'requirements.txt'))
      .then(() => 'python')
      .catch(() => fs.access(path.join(repoPath, 'go.mod'))
        .then(() => 'go')
        .catch(() => 'unknown')));
}

function extractPortFromPackageJson(packageJson) {
  const scripts = packageJson.scripts || {};
  const startScript = scripts.start || scripts.dev || '';

  const portMatch = startScript.match(/(?:--port|PORT=|:)(\d+)/);
  return portMatch ? parseInt(portMatch[1]) : null;
}

function extractPortFromDockerfile(content) {
  const exposeMatch = content.match(/EXPOSE\s+(\d+)/i);
  return exposeMatch ? parseInt(exposeMatch[1]) : null;
}

async function detectPythonVersion(repoPath) {
  try {
    const pyprojectPath = path.join(repoPath, 'pyproject.toml');
    const pyprojectExists = await fs.access(pyprojectPath).then(() => true).catch(() => false);

    if (pyprojectExists) {
      const content = await fs.readFile(pyprojectPath, 'utf8');
      const versionMatch = content.match(/python\s*=\s*"([^"]+)"/);
      if (versionMatch) {
        return versionMatch[1].replace(/[^\d.]/g, '').substring(0, 4);
      }
    }

    const runtimePath = path.join(repoPath, 'runtime.txt');
    const runtimeExists = await fs.access(runtimePath).then(() => true).catch(() => false);

    if (runtimeExists) {
      const content = await fs.readFile(runtimePath, 'utf8');
      const versionMatch = content.match(/python-(\d+\.\d+)/);
      if (versionMatch) {
        return versionMatch[1];
      }
    }

  } catch (error) {
    console.error('Error detecting Python version:', error);
  }

  return '3.11';
}

async function deployToNomad(nomadClient, config) {
  const jobTemplate = config.appType === 'python' ? 'python-app' : 'github-app';

  const jobPayload = {
    Job: {
      ID: config.appName,
      Name: config.appName,
      Type: 'batch',
      Datacenters: ['dc1'],
      ParameterizedJob: {
        Payload: 'required',
        MetaRequired: ['GITHUB_SLUG', 'APP_NAME', 'PORT'],
        MetaOptional: config.appType === 'python' ? ['PYTHON_VERSION'] : ['BUILD_COMMAND', 'START_COMMAND']
      },
      Dispatched: true,
      Meta: {
        GITHUB_SLUG: config.slug,
        APP_NAME: config.appName,
        PORT: config.port.toString(),
        ...(config.appType === 'python' && config.pythonVersion && { PYTHON_VERSION: config.pythonVersion }),
        ...(config.appType === 'node' && config.buildCmd && { BUILD_COMMAND: config.buildCmd }),
        ...(config.appType === 'node' && config.startCmd && { START_COMMAND: config.startCmd })
      }
    }
  };

  const response = await nomadClient.post(`/v1/job/${config.appName}/dispatch`, jobPayload);
  return response.data.DispatchedJobID;
}

module.exports = {
  analyzeRepository,
  deployToNomad,
  detectAppType
};