# HashiStack Testing Guide

This document provides comprehensive information about testing the HashiStack deployment system.

## Test Structure

```
__tests__/
├── infrastructure/          # Docker and infrastructure tests
│   ├── docker-compose.test.js
│   └── nomad.test.js
└── slug-processor/
    └── __tests__/
        ├── unit/           # Unit tests
        │   ├── api.test.js
        │   └── utils.test.js
        ├── integration/    # Integration tests
        │   └── deployment.test.js
        └── fixtures/       # Test data and mocks
            └── sample-configs.js
```

## Test Types

### 1. Unit Tests
- **Location**: `slug-processor/__tests__/unit/`
- **Purpose**: Test individual functions and modules in isolation
- **Coverage**: API endpoints, utility functions, configuration parsing

**Key test files:**
- `api.test.js` - Tests Express.js API endpoints
- `utils.test.js` - Tests repository analysis and deployment utilities

### 2. Integration Tests
- **Location**: `slug-processor/__tests__/integration/`
- **Purpose**: Test interactions between services (Consul, Vault, Slug Processor)
- **Requirements**: Running test infrastructure

**Key test files:**
- `deployment.test.js` - End-to-end deployment workflow tests

### 3. Infrastructure Tests
- **Location**: `__tests__/infrastructure/`
- **Purpose**: Test Docker containers, networking, and service configuration
- **Requirements**: Docker and Docker Compose

**Key test files:**
- `docker-compose.test.js` - Container health, networking, environment variables
- `nomad.test.js` - Nomad service tests (requires full stack)

## Running Tests

### Prerequisites

Ensure you have the following installed:
- Node.js (v18+)
- npm
- Docker
- Docker Compose

### Quick Start

Use the test runner for automated testing:

```bash
# Run all tests
./test-runner.js

# Run specific test types
./test-runner.js unit
./test-runner.js integration
./test-runner.js infrastructure
./test-runner.js coverage
```

### Manual Test Execution

#### Unit Tests Only
```bash
cd slug-processor
npm install
npm test -- --testPathIgnorePatterns=integration
```

#### Integration Tests
```bash
# Start test infrastructure
docker compose -f test-minimal.yml up -d

# Wait for services to be ready, then run tests
cd slug-processor
npm test -- --testPathPattern=integration

# Clean up
docker compose -f test-minimal.yml down -v
```

#### Infrastructure Tests
```bash
# Start test infrastructure
docker compose -f test-minimal.yml up -d

# Run infrastructure tests
npx jest __tests__/infrastructure --testTimeout=60000

# Clean up
docker compose -f test-minimal.yml down -v
```

#### Coverage Report
```bash
cd slug-processor
npm run test:coverage
```

View the coverage report at `slug-processor/coverage/lcov-report/index.html`

## Test Configuration

### Jest Configuration

The Jest configuration is defined in `slug-processor/package.json`:

```json
{
  "jest": {
    "testEnvironment": "node",
    "collectCoverageFrom": [
      "src/**/*.js",
      "!src/index.js"
    ],
    "coverageDirectory": "coverage",
    "coverageReporters": ["text", "lcov", "html"],
    "testMatch": [
      "**/__tests__/**/*.test.js",
      "**/?(*.)+(spec|test).js"
    ]
  }
}
```

### Test Environment Variables

For integration tests, the following environment variables are used:

```bash
CONSUL_ADDR=http://localhost:8510
VAULT_ADDR=http://localhost:8210
VAULT_TOKEN=myroot
SLUG_PROCESSOR_URL=http://localhost:3010
```

### Test Infrastructure

The test infrastructure uses `test-minimal.yml` which includes:
- **Consul** (port 8510)
- **Vault** (port 8210)
- **Slug Processor** (port 3010)

## Writing Tests

### Unit Test Example

```javascript
const { detectAppType } = require('../../src/utils');

describe('detectAppType', () => {
  it('should detect Node.js app when package.json exists', async () => {
    // Mock fs.access to simulate package.json existence
    fs.access.mockImplementation((filePath) => {
      if (filePath.includes('package.json')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('ENOENT'));
    });

    const result = await detectAppType('/test/path');
    expect(result).toBe('node');
  });
});
```

### Integration Test Example

```javascript
describe('End-to-End Deployment Flow', () => {
  it('should deploy a simple Node.js app', async () => {
    const testSlug = 'expressjs/express';

    const deployResponse = await axios.post(`${SLUG_PROCESSOR_URL}/deploy`, {
      slugs: [testSlug]
    });

    expect(deployResponse.status).toBe(200);
    expect(deployResponse.data.results).toHaveLength(1);
  });
});
```

### Infrastructure Test Example

```javascript
describe('Container Health', () => {
  it('should have all containers running', () => {
    const output = execSync(`docker compose -f ${COMPOSE_FILE} ps --format json`);
    const containers = output.trim().split('\n').map(line => JSON.parse(line));

    expect(containers).toHaveLength(3);
    containers.forEach(container => {
      expect(container.State).toBe('running');
    });
  });
});
```

## Test Data and Fixtures

Test fixtures are located in `slug-processor/__tests__/fixtures/sample-configs.js` and include:

- Sample package.json configurations
- Sample Dockerfiles
- Sample Python requirements.txt files
- Sample Nomad job definitions
- Mock Consul data

Example usage:
```javascript
const { samplePackageJson } = require('../fixtures/sample-configs');

// Use in tests
fs.readFile.mockResolvedValue(JSON.stringify(samplePackageJson.basic));
```

## Continuous Integration

For CI/CD pipelines, use the test runner:

```bash
# Install dependencies and run all tests
./test-runner.js all

# Or run specific test suites
./test-runner.js unit && ./test-runner.js integration
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 8510, 8210, and 3010 are available
2. **Docker issues**: Make sure Docker daemon is running
3. **Timeout errors**: Services may take time to start; increase timeout if needed
4. **Permission errors**: Ensure test-runner.js is executable (`chmod +x test-runner.js`)

### Debug Mode

For verbose test output:
```bash
cd slug-processor
npm test -- --verbose
```

For Docker logs:
```bash
docker compose -f test-minimal.yml logs -f
```

### Cleanup

If tests fail to clean up properly:
```bash
# Stop all test containers
docker compose -f test-minimal.yml down -v

# Remove any orphaned containers
docker system prune -f
```

## Test Coverage Goals

- **Unit Tests**: > 80% code coverage
- **Integration Tests**: Cover all API endpoints and service interactions
- **Infrastructure Tests**: Verify all container configurations and networking

## Contributing

When adding new features:

1. Write unit tests for new functions
2. Add integration tests for new API endpoints
3. Update infrastructure tests if Docker configuration changes
4. Update this documentation if test structure changes

Run tests before submitting PRs:
```bash
./test-runner.js all
```