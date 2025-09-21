job "python-app" {
  datacenters = ["dc1"]
  type = "service"

  parameterized {
    payload = "required"
    meta_required = ["GITHUB_SLUG", "APP_NAME", "PORT"]
    meta_optional = ["REQUIREMENTS_FILE", "PYTHON_VERSION"]
  }

  group "app" {
    count = 1

    network {
      port "http" {
        to = "${NOMAD_META_PORT}"
      }
    }

    task "python-app" {
      driver = "docker"

      template {
        data = <<EOF
#!/bin/bash
set -e

GITHUB_SLUG="{{ env "NOMAD_META_GITHUB_SLUG" }}"
APP_NAME="{{ env "NOMAD_META_APP_NAME" }}"
REQUIREMENTS_FILE="{{ env "NOMAD_META_REQUIREMENTS_FILE" | default "requirements.txt" }}"

echo "Cloning repository: $GITHUB_SLUG"
git clone https://github.com/$GITHUB_SLUG.git /app
cd /app

if [ -f "$REQUIREMENTS_FILE" ]; then
  echo "Installing dependencies from $REQUIREMENTS_FILE"
  pip install -r $REQUIREMENTS_FILE
fi

if [ -f "app.py" ]; then
  exec python app.py
elif [ -f "main.py" ]; then
  exec python main.py
elif [ -f "server.py" ]; then
  exec python server.py
else
  echo "No main Python file found (app.py, main.py, or server.py)"
  exit 1
fi
EOF
        destination = "local/start.sh"
        perms = "755"
      }

      config {
        image = "python:${NOMAD_META_PYTHON_VERSION:-3.11}-slim"
        command = "/bin/bash"
        args = ["local/start.sh"]
        ports = ["http"]
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
        cpu = 300
        memory = 256
      }
    }
  }
}