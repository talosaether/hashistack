.PHONY: up down restart logs status deploy health vault-setup clean test test-unit test-integration test-infrastructure test-coverage

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

status:
	docker compose ps

vault-setup:
	docker compose exec vault /vault/setup.sh

health:
	@echo "Checking service health..."
	@curl -s http://localhost:3000/health | jq .
	@curl -s http://localhost:8500/v1/status/leader
	@curl -s http://localhost:8200/v1/sys/health | jq .
	@curl -s http://localhost:4646/v1/status/leader

deploy-example:
	curl -X POST http://localhost:3000/deploy \
		-H "Content-Type: application/json" \
		-d '{"slugs": ["expressjs/express", "pallets/flask"]}'

list-apps:
	curl -s http://localhost:3000/apps | jq .

terraform-init:
	docker compose exec terraform terraform init

terraform-plan:
	docker compose exec terraform terraform plan

terraform-apply:
	docker compose exec terraform terraform apply -auto-approve

clean:
	docker compose down -v
	docker system prune -f

test:
	./test-runner.js all

test-unit:
	./test-runner.js unit

test-integration:
	./test-runner.js integration

test-infrastructure:
	./test-runner.js infrastructure

test-coverage:
	./test-runner.js coverage