const samplePackageJson = {
  basic: {
    name: 'test-app',
    version: '1.0.0',
    scripts: {
      start: 'node server.js'
    }
  },
  withBuild: {
    name: 'test-app',
    version: '1.0.0',
    scripts: {
      build: 'webpack --mode production',
      start: 'node dist/server.js'
    }
  },
  withPort: {
    name: 'test-app',
    version: '1.0.0',
    scripts: {
      start: 'node server.js --port 8080'
    }
  },
  withDev: {
    name: 'test-app',
    version: '1.0.0',
    scripts: {
      dev: 'nodemon app.js',
      build: 'npm run compile'
    }
  }
};

const sampleDockerfiles = {
  nodeApp: `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
  `,
  pythonApp: `
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
  `,
  customPort: `
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 8080
CMD ["node", "server.js"]
  `
};

const sampleRequirementsTxt = {
  basic: `
flask==2.3.2
gunicorn==20.1.0
requests==2.31.0
  `,
  withVersions: `
django>=4.0,<5.0
psycopg2-binary==2.9.7
celery[redis]==5.3.1
  `
};

const sampleRuntimeTxt = {
  python39: 'python-3.9.16',
  python311: 'python-3.11.4',
  python38: 'python-3.8.17'
};

const samplePyprojectToml = {
  basic: `
[tool.poetry]
name = "test-app"
version = "0.1.0"
description = ""

[tool.poetry.dependencies]
python = "^3.9"
flask = "^2.3.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
  `,
  withSpecificVersion: `
[tool.poetry]
name = "test-app"
version = "0.1.0"

[tool.poetry.dependencies]
python = "3.11.4"
django = "^4.2.0"
  `
};

const sampleNomadJobs = {
  nodeApp: {
    Job: {
      ID: 'test-node-app',
      Name: 'test-node-app',
      Type: 'service',
      Datacenters: ['dc1'],
      TaskGroups: [{
        Name: 'app',
        Count: 1,
        Tasks: [{
          Name: 'node-app',
          Driver: 'docker',
          Config: {
            image: 'node:18',
            command: 'npm',
            args: ['start']
          },
          Resources: {
            CPU: 100,
            MemoryMB: 256
          }
        }]
      }]
    }
  },
  pythonApp: {
    Job: {
      ID: 'test-python-app',
      Name: 'test-python-app',
      Type: 'service',
      Datacenters: ['dc1'],
      TaskGroups: [{
        Name: 'app',
        Count: 1,
        Tasks: [{
          Name: 'python-app',
          Driver: 'docker',
          Config: {
            image: 'python:3.9',
            command: 'python',
            args: ['app.py']
          },
          Resources: {
            CPU: 100,
            MemoryMB: 256
          }
        }]
      }]
    }
  }
};

const sampleConsulData = {
  apps: [
    {
      Key: 'apps/express/config',
      Value: Buffer.from(JSON.stringify({
        slug: 'expressjs/express',
        appName: 'express',
        appType: 'node',
        port: 3000,
        buildCmd: 'npm install',
        startCmd: 'npm start'
      })).toString('base64')
    },
    {
      Key: 'apps/flask/config',
      Value: Buffer.from(JSON.stringify({
        slug: 'pallets/flask',
        appName: 'flask',
        appType: 'python',
        port: 5000,
        pythonVersion: '3.9'
      })).toString('base64')
    }
  ]
};

const sampleDeploymentConfigs = {
  nodeApp: {
    slug: 'expressjs/express',
    appName: 'express',
    appType: 'node',
    port: 3000,
    buildCmd: 'npm install',
    startCmd: 'npm start',
    pythonVersion: null
  },
  pythonApp: {
    slug: 'pallets/flask',
    appName: 'flask',
    appType: 'python',
    port: 5000,
    buildCmd: 'pip install -r requirements.txt',
    startCmd: 'python app.py',
    pythonVersion: '3.9'
  },
  goApp: {
    slug: 'gin-gonic/gin',
    appName: 'gin',
    appType: 'go',
    port: 8080,
    buildCmd: 'go build -o main .',
    startCmd: './main',
    pythonVersion: null
  }
};

module.exports = {
  samplePackageJson,
  sampleDockerfiles,
  sampleRequirementsTxt,
  sampleRuntimeTxt,
  samplePyprojectToml,
  sampleNomadJobs,
  sampleConsulData,
  sampleDeploymentConfigs
};