############################################# CONFIG #############################################

PROJECT_FILE := .selected_project
TEMPLATE := docker-compose-template.yml
TEMPLATE_ZSCALER := docker-compose-template-zscaler.yml
ZSCALER_CERT := zscaler.crt
COMPOSE_FILE := docker-compose.yml
APP_WEBSITE := https://autotest2.qa.insider-log.com/

############################################# HELPERS #############################################

# detect folders starting with qa_, excluding qa_tools
PROJECTS = $(filter-out qa_tools,$(notdir $(wildcard ../../qa_*)))

# Default goal
.DEFAULT_GOAL := help

# Helper: load project variables and validate
LOAD_PROJECT = \
	if [ ! -f $(PROJECT_FILE) ]; then \
		echo "No project selected! Run 'make init-project' first."; \
		exit 0; \
	fi; \
	export PROJECT_NAME=$$(grep '^project=' $(PROJECT_FILE) | cut -d'=' -f2); \
	export DOCKER_SERVICE=$$(grep '^service=' $(PROJECT_FILE) | cut -d'=' -f2)

############################################# COMMANDS #############################################

help: ## Show this help menu
	@echo ""
	@if [ -f $(PROJECT_FILE) ]; then \
		PROJECT_NAME=$$(grep '^project=' $(PROJECT_FILE) | cut -d'=' -f2); \
		echo "Available commands (project: $$PROJECT_NAME):"; \
	else \
		echo "Available commands (project: none selected)"; \
		echo "→ Run 'make init-project' to select a project."; \
	fi
	@grep -E '^[a-zA-Z0-9_-]+:.*?##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1;35m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""


init-project: ## List QA projects and let user select one, generates docker-compose.yml
	@echo "Found QA projects:"; \
	i=1; \
	for p in $(PROJECTS); do \
		echo "  $$i) $$p"; \
		i=$$((i+1)); \
	done; \
	echo "  0) exit"; \
	echo ""; \
	proj=""; \
	while [ -z "$$proj" ]; do \
		read -p "Enter the number of the project to use: " sel; \
		if [ "$$sel" = "0" ]; then \
			echo "Exit selected. Nothing was created."; \
			exit 0; \
		fi; \
		proj=$$(echo $(PROJECTS) | cut -d' ' -f$$sel); \
		if [ -z "$$proj" ]; then \
			echo "Invalid selection, try again."; \
		fi; \
	done; \
	echo "project=$$proj" > $(PROJECT_FILE); \
	echo "service=$${proj}_service" >> $(PROJECT_FILE); \
	echo "Selected project: $$proj"; \
	echo "Generating docker-compose.yml for project: $$proj"; \
	rm -f $(COMPOSE_FILE); \
	if echo "$$proj" | grep -q "ibabs"; then \
		cp $(TEMPLATE_ZSCALER) $(COMPOSE_FILE); \
		mkdir -p ../../$$proj/cypress/fixtures/tmp; \
		cp $(ZSCALER_CERT) ../../$$proj/cypress/fixtures/tmp/zscaler.crt; \
	else \
		cp $(TEMPLATE) $(COMPOSE_FILE); \
	fi; \
	sed -i "s|REPLACE_ME|$$proj|g" $(COMPOSE_FILE); \
	echo "Done → $(COMPOSE_FILE) created."


build: ## Build Docker image(s)
	@$(LOAD_PROJECT); \
	echo "Building project $$PROJECT_NAME with service $$DOCKER_SERVICE"; \
	COMPOSE_BAKE=true docker-compose build

start: ## Start containers (detached mode)
	@$(LOAD_PROJECT); \
	echo "Starting project $$PROJECT_NAME with service $$DOCKER_SERVICE"; \
	docker-compose -f $(COMPOSE_FILE) up -d

stop: ## Stop and remove containers
	@$(LOAD_PROJECT); \
	echo "Stopping project $$PROJECT_NAME with service $$DOCKER_SERVICE"; \
	docker-compose -f $(COMPOSE_FILE) down

bash: ## Open bash shell in container
	@$(LOAD_PROJECT); \
	echo "Opening bash in project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE bash

cypress-open: ## Launch Cypress GUI
	@$(LOAD_PROJECT); \
	echo "Launching Cypress GUI for project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE npx cypress open

cypress-run: ## Run Cypress headless
	@$(LOAD_PROJECT); \
	echo "Running Cypress headless for project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE npx cypress run

cypress-run-specific: ## Run specific specs
	@$(LOAD_PROJECT); \
	echo "Running specific Cypress specs for project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE bash -c "node run-specific-specs.js"

browser-firefox: ## Open Firefox pointing to target website
	@$(LOAD_PROJECT); \
	echo "Opening Firefox for project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE bash -c "firefox '$(APP_WEBSITE)' &> /dev/null"

browser-chrome: ## Open Chrome pointing to target website
	@$(LOAD_PROJECT); \
	echo "Opening Chrome for project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) run --rm $$DOCKER_SERVICE bash -c "google-chrome --no-sandbox '$(APP_WEBSITE)' &> /dev/null"

check: ## Check images, containers and volumes status
	@echo "------------------- Docker Images ------------------"
	@docker images
	@echo ""
	@echo "----------------- All Containers (Running + Stopped) ----------------"
	@docker ps -a
	@echo ""
	@echo "-------------------- Docker Volumes ------------------"
	@docker volume ls

clean: ## Remove containers, volumes, images and clear project selection
	@$(LOAD_PROJECT); \
	echo "Cleaning project $$PROJECT_NAME"; \
	docker-compose -f $(COMPOSE_FILE) down -v --rmi local || true; \
	echo "Removing image for $${PROJECT_NAME} if it exists..."; \
	docker images --format '{{.Repository}}:{{.Tag}}' \
		| grep "$$PROJECT_NAME" \
		| xargs -r docker rmi -f; \
	echo "Removing volumes for $${PROJECT_NAME} if it exists..."; \
	docker volume rm -f $${PROJECT_NAME} || true; \
	rm -f $(PROJECT_FILE); \
	echo "Done, project selection cleared."
	rm -f $(COMPOSE_FILE); \
	echo "Created compose now cleared."



