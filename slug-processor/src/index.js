const express = require('express');
const axios = require('axios');
const vault = require('node-vault');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const { analyzeRepository, deployToNomad, detectAppType } = require('./utils');

const app = express();
app.use(express.json());

const vaultClient = vault({
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN || 'myroot'
});

const nomadClient = axios.create({
  baseURL: process.env.NOMAD_ADDR || 'http://nomad:4646',
  headers: { 'Content-Type': 'application/json' }
});

const consulClient = axios.create({
  baseURL: process.env.CONSUL_ADDR || 'http://consul:8500',
  headers: { 'Content-Type': 'application/json' }
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
        console.log(`Processing repository: ${slug}`);

        const repoPath = path.join('/app/repos', slug.replace('/', '_'));
        await fs.mkdir(repoPath, { recursive: true });

        const git = simpleGit();
        await git.clone(`https://github.com/${slug}.git`, repoPath);

        const repoConfig = await analyzeRepository(repoPath);
        const appType = detectAppType(repoPath);

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
        console.error(`Error processing ${slug}:`, error.message);
        results.push({
          slug,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({ results });

  } catch (error) {
    console.error('Deployment error:', error);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Slug processor running on port ${PORT}`);
});