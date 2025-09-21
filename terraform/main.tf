terraform {
  required_providers {
    nomad = {
      source  = "hashicorp/nomad"
      version = "~> 2.0"
    }
    consul = {
      source  = "hashicorp/consul"
      version = "~> 2.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.0"
    }
  }
}

provider "nomad" {
  address = var.nomad_address
}

provider "consul" {
  address = var.consul_address
}

provider "vault" {
  address = var.vault_address
  token   = var.vault_token
}

variable "nomad_address" {
  description = "Nomad server address"
  type        = string
  default     = "http://nomad:4646"
}

variable "consul_address" {
  description = "Consul server address"
  type        = string
  default     = "consul:8500"
}

variable "vault_address" {
  description = "Vault server address"
  type        = string
  default     = "http://vault:8200"
}

variable "vault_token" {
  description = "Vault token"
  type        = string
  default     = "myroot"
  sensitive   = true
}

variable "github_repositories" {
  description = "List of GitHub repositories to deploy"
  type = list(object({
    slug         = string
    app_name     = string
    app_type     = string
    port         = number
    build_cmd    = optional(string)
    start_cmd    = optional(string)
    python_version = optional(string)
  }))
  default = []
}