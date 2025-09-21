datacenter = "dc1"
data_dir = "/nomad/data"
bind_addr = "0.0.0.0"

server {
  enabled = true
  bootstrap_expect = 1
}

client {
  enabled = true
  servers = ["127.0.0.1:4647"]
}

consul {
  address = "consul:8500"
}

vault {
  enabled = true
  address = "http://vault:8200"
  token = "myroot"
}

plugin "docker" {
  config {
    allow_privileged = true
    volumes {
      enabled = true
    }
  }
}