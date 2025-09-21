path "secret/github/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/deployments/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}