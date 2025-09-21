#!/bin/bash

export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=myroot

echo "Setting up Vault policies and secrets..."

vault policy write github-policy /vault/policies/github-policy.hcl

vault secrets enable -path=secret kv-v2

echo "Vault setup complete. You can now store GitHub tokens at secret/github/token"
echo "Example: vault kv put secret/github/token value=ghp_your_token_here"