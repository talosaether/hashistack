#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const SLUG_PROCESSOR_DIR = path.join(PROJECT_ROOT, 'slug-processor');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'inherit',
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message, code: error.status };
  }
}

async function checkPrerequisites() {
  log('\n🔍 Checking prerequisites...', colors.blue);

  const checks = [
    { name: 'Node.js', command: 'node --version' },
    { name: 'npm', command: 'npm --version' },
    { name: 'Docker', command: 'docker --version' },
    { name: 'Docker Compose', command: 'docker compose version' }
  ];

  let allGood = true;

  for (const check of checks) {
    const result = runCommand(check.command, { stdio: 'pipe' });
    if (result.success) {
      log(`✅ ${check.name} is available`, colors.green);
    } else {
      log(`❌ ${check.name} is not available`, colors.red);
      allGood = false;
    }
  }

  return allGood;
}

async function installDependencies() {
  log('\n📦 Installing dependencies...', colors.blue);

  const result = runCommand('npm install', { cwd: SLUG_PROCESSOR_DIR });

  if (result.success) {
    log('✅ Dependencies installed successfully', colors.green);
    return true;
  } else {
    log('❌ Failed to install dependencies', colors.red);
    return false;
  }
}

async function runUnitTests() {
  log('\n🧪 Running unit tests...', colors.blue);

  const result = runCommand('npm test -- --testPathIgnorePatterns=integration', {
    cwd: SLUG_PROCESSOR_DIR
  });

  if (result.success) {
    log('✅ Unit tests passed', colors.green);
    return true;
  } else {
    log('❌ Unit tests failed', colors.red);
    return false;
  }
}

async function startTestInfrastructure() {
  log('\n🐳 Starting test infrastructure...', colors.blue);

  log('Stopping any existing containers...', colors.yellow);
  runCommand('docker compose -f test-minimal.yml down -v', {
    cwd: PROJECT_ROOT,
    stdio: 'pipe'
  });

  log('Starting test containers...', colors.yellow);
  const result = runCommand('docker compose -f test-minimal.yml up -d', {
    cwd: PROJECT_ROOT
  });

  if (result.success) {
    log('✅ Test infrastructure started', colors.green);
    return true;
  } else {
    log('❌ Failed to start test infrastructure', colors.red);
    return false;
  }
}

async function waitForServices() {
  log('\n⏳ Waiting for services to be ready...', colors.blue);

  const services = [
    { name: 'Consul', url: 'http://localhost:8510/v1/status/leader' },
    { name: 'Vault', url: 'http://localhost:8210/v1/sys/health' },
    { name: 'Slug Processor', url: 'http://localhost:3010/health' }
  ];

  let axios;
  try {
    axios = require('axios');
  } catch (error) {
    try {
      axios = require('./slug-processor/node_modules/axios');
    } catch (error2) {
      log('❌ axios not found, please install dependencies first', colors.red);
      return false;
    }
  }

  for (const service of services) {
    log(`Waiting for ${service.name}...`, colors.yellow);

    let retries = 30;
    let ready = false;

    while (retries > 0 && !ready) {
      try {
        await axios.get(service.url, { timeout: 5000 });
        ready = true;
        log(`✅ ${service.name} is ready`, colors.green);
      } catch (error) {
        retries--;
        if (retries === 0) {
          log(`❌ ${service.name} failed to start`, colors.red);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  return true;
}

async function runIntegrationTests() {
  log('\n🔗 Running integration tests...', colors.blue);

  const result = runCommand('npm test -- --testPathPattern=integration', {
    cwd: SLUG_PROCESSOR_DIR,
    env: {
      ...process.env,
      CONSUL_ADDR: 'http://localhost:8510',
      VAULT_ADDR: 'http://localhost:8210',
      VAULT_TOKEN: 'myroot',
      SLUG_PROCESSOR_URL: 'http://localhost:3010'
    }
  });

  if (result.success) {
    log('✅ Integration tests passed', colors.green);
    return true;
  } else {
    log('❌ Integration tests failed', colors.red);
    return false;
  }
}

async function runInfrastructureTests() {
  log('\n🏗️ Running infrastructure tests...', colors.blue);

  if (!fs.existsSync(path.join(PROJECT_ROOT, '__tests__'))) {
    log('⚠️ Infrastructure tests directory not found, skipping...', colors.yellow);
    return true;
  }

  const result = runCommand('npx jest __tests__/infrastructure --testTimeout=60000', {
    cwd: PROJECT_ROOT
  });

  if (result.success) {
    log('✅ Infrastructure tests passed', colors.green);
    return true;
  } else {
    log('❌ Infrastructure tests failed', colors.red);
    return false;
  }
}

async function generateCoverageReport() {
  log('\n📊 Generating coverage report...', colors.blue);

  const result = runCommand('npm run test:coverage', {
    cwd: SLUG_PROCESSOR_DIR
  });

  if (result.success) {
    log('✅ Coverage report generated', colors.green);
    log(`📄 Coverage report available at: ${path.join(SLUG_PROCESSOR_DIR, 'coverage/lcov-report/index.html')}`, colors.cyan);
    return true;
  } else {
    log('❌ Failed to generate coverage report', colors.red);
    return false;
  }
}

async function stopTestInfrastructure() {
  log('\n🛑 Stopping test infrastructure...', colors.blue);

  const result = runCommand('docker compose -f test-minimal.yml down -v', {
    cwd: PROJECT_ROOT,
    stdio: 'pipe'
  });

  if (result.success) {
    log('✅ Test infrastructure stopped', colors.green);
  } else {
    log('⚠️ Error stopping test infrastructure', colors.yellow);
  }
}

async function main() {
  log('🚀 HashiStack Test Runner', colors.magenta);
  log('='.repeat(50), colors.magenta);

  const testType = process.argv[2] || 'all';
  let success = true;

  try {
    // Always check prerequisites
    if (!(await checkPrerequisites())) {
      process.exit(1);
    }

    // Install dependencies
    if (!(await installDependencies())) {
      process.exit(1);
    }

    switch (testType) {
      case 'unit':
        success = await runUnitTests();
        break;

      case 'integration':
        if (await startTestInfrastructure()) {
          if (await waitForServices()) {
            success = await runIntegrationTests();
          } else {
            success = false;
          }
          await stopTestInfrastructure();
        } else {
          success = false;
        }
        break;

      case 'infrastructure':
        if (await startTestInfrastructure()) {
          if (await waitForServices()) {
            success = await runInfrastructureTests();
          } else {
            success = false;
          }
          await stopTestInfrastructure();
        } else {
          success = false;
        }
        break;

      case 'coverage':
        success = await generateCoverageReport();
        break;

      case 'all':
      default:
        // Run unit tests first
        if (!(await runUnitTests())) {
          success = false;
          break;
        }

        // Start infrastructure and run integration tests
        if (await startTestInfrastructure()) {
          if (await waitForServices()) {
            const integrationSuccess = await runIntegrationTests();
            const infrastructureSuccess = await runInfrastructureTests();
            success = integrationSuccess && infrastructureSuccess;
          } else {
            success = false;
          }
          await stopTestInfrastructure();
        } else {
          success = false;
        }

        // Generate coverage report
        if (success) {
          await generateCoverageReport();
        }
        break;
    }

    log('\n' + '='.repeat(50), colors.magenta);
    if (success) {
      log('🎉 All tests completed successfully!', colors.green);
      process.exit(0);
    } else {
      log('💥 Some tests failed!', colors.red);
      process.exit(1);
    }

  } catch (error) {
    log(`\n💥 Unexpected error: ${error.message}`, colors.red);
    await stopTestInfrastructure();
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  log('\n\n🛑 Test runner interrupted', colors.yellow);
  await stopTestInfrastructure();
  process.exit(1);
});

if (require.main === module) {
  main();
}