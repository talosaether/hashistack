job "github-app" {
  datacenters = ["dc1"]
  type = "service"

  parameterized {
    payload = "required"
    meta_required = ["GITHUB_SLUG", "APP_NAME", "BUILD_COMMAND", "START_COMMAND", "PORT"]
  }

  group "app" {
    count = 1

    network {
      port "http" {
        to = "${NOMAD_META_PORT}"
      }
    }

    task "build-and-run" {
      driver = "docker"

      template {
        data = <<EOF
#!/bin/bash
set -e

GITHUB_SLUG="{{ env "NOMAD_META_GITHUB_SLUG" }}"
APP_NAME="{{ env "NOMAD_META_APP_NAME" }}"
BUILD_COMMAND="{{ env "NOMAD_META_BUILD_COMMAND" }}"
START_COMMAND="{{ env "NOMAD_META_START_COMMAND" }}"

echo "Cloning repository: $GITHUB_SLUG"
git clone https://github.com/$GITHUB_SLUG.git /app
cd /app

if [ -n "$BUILD_COMMAND" ] && [ "$BUILD_COMMAND" != "none" ]; then
  echo "Running build command: $BUILD_COMMAND"
  eval $BUILD_COMMAND
fi

echo "Starting application with: $START_COMMAND"
exec $START_COMMAND
EOF
        destination = "local/start.sh"
        perms = "755"
      }

      config {
        image = "node:18-alpine"
        command = "/bin/sh"
        args = ["local/start.sh"]
        ports = ["http"]

        mount {
          type = "bind"
          source = "local"
          target = "/scripts"
        }
      }

      vault {
        policies = ["github-policy"]
      }

      template {
        data = <<EOF
{{ with secret "secret/github/token" }}
GITHUB_TOKEN={{ .Data.data.value }}
{{ end }}
EOF
        destination = "secrets/github.env"
        env = true
      }

      service {
        name = "${NOMAD_META_APP_NAME}"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.${NOMAD_META_APP_NAME}.rule=Host(`${NOMAD_META_APP_NAME}.localhost`)",
          "traefik.http.routers.${NOMAD_META_APP_NAME}.entrypoints=web",
        ]

        check {
          type = "http"
          path = "/"
          interval = "30s"
          timeout = "5s"
        }
      }

      resources {
        cpu = 500
        memory = 512
      }
    }
  }
}