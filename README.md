# HashiStack GitHub Slug Processor

A complete HashiCorp stack implementation that takes GitHub repository slugs as input and deploys them as containerized applications using Nomad, Consul, Vault, and Terraform.

## Architecture

- **Input**: List of GitHub slugs (format: `owner/repo`)
- **Nomad**: Orchestrates container deployment and job scheduling
- **Consul**: Service discovery, health checking, and configuration storage
- **Vault**: Secrets management for GitHub tokens and deployment credentials
- **Terraform**: Infrastructure as Code for provisioning and managing deployments
- **Traefik**: Load balancer and reverse proxy with automatic service discovery

## Quick Start

1. **Start the stack**:
   ```bash
   docker compose up -d
   ```

2. **Setup Vault** (first time only):
   ```bash
   docker compose exec vault /vault/setup.sh
   ```

3. **Store GitHub token** (optional, for private repos):
   ```bash
   docker compose exec vault vault kv put secret/github/token value=ghp_your_token_here
   ```

4. **Deploy repositories**:
   ```bash
   curl -X POST http://localhost:3000/deploy \
     -H "Content-Type: application/json" \
     -d '{"slugs": ["expressjs/express", "pallets/flask"]}'
   ```

## API Endpoints

### Deploy Repositories
```bash
POST /deploy
{
  "slugs": ["owner/repo1", "owner/repo2"]
}
```

### List Deployed Apps
```bash
GET /apps
```

### Health Check
```bash
GET /health
```

## Web Interfaces

- **Nomad UI**: http://localhost:4646
- **Consul UI**: http://localhost:8500
- **Vault UI**: http://localhost:8200
- **Traefik Dashboard**: http://localhost:8080
- **Slug Processor**: http://localhost:3000

## Supported Application Types

### Node.js Applications
- Automatically detects `package.json`
- Runs `npm install` for dependencies
- Uses `npm start` or `npm run dev` to start
- Default port: 3000

### Python Applications
- Automatically detects `requirements.txt`
- Installs dependencies with pip
- Looks for `app.py`, `main.py`, or `server.py`
- Default port: 5000
- Supports Python version specification

## Using Terraform

For infrastructure-as-code deployment:

1. **Copy example variables**:
   ```bash
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   ```

2. **Edit terraform.tfvars** with your repositories:
   ```hcl
   github_repositories = [
     {
       slug         = "your-org/your-repo"
       app_name     = "my-app"
       app_type     = "node"
       port         = 3000
       build_cmd    = "npm install"
       start_cmd    = "npm start"
     }
   ]
   ```

3. **Deploy with Terraform**:
   ```bash
   docker compose exec terraform terraform init
   docker compose exec terraform terraform plan
   docker compose exec terraform terraform apply
   ```

## Service Discovery

Deployed applications are automatically:
- Registered in Consul with health checks
- Exposed via Traefik at `http://{app-name}.localhost`
- Load balanced across multiple instances
- Monitored for health and availability

## Security

- Vault manages all secrets and tokens
- Consul Connect provides service mesh security
- Network isolation between services
- No secrets stored in plain text

## Troubleshooting

1. **Check service status**:
   ```bash
   docker compose ps
   ```

2. **View logs**:
   ```bash
   docker compose logs nomad
   docker compose logs consul
   docker compose logs vault
   ```

3. **Restart services**:
   ```bash
   docker compose restart
   ```

## Example Usage

Deploy a Node.js and Python application:

```bash
curl -X POST http://localhost:3000/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "slugs": [
      "expressjs/express",
      "pallets/flask"
    ]
  }'
```

Access deployed applications:
- Express: http://express.localhost
- Flask: http://flask.localhost

## License

MIT License - see LICENSE file for details.