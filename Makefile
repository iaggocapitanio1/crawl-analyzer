BACKEND_DIR  := backend
FRONTEND_DIR := frontend

DC := docker compose

.PHONY: setup start stop restart \
        setup-backend setup-frontend \
        start-backend start-frontend \
        stop-backend  stop-frontend \
        restart-backend restart-frontend

# ---------- aggregate targets ----------
setup:   setup-backend setup-frontend start
start:   start-backend start-frontend
stop:    stop-frontend stop-backend
restart: restart-backend restart-frontend

# ---------- backend (Django + Postgres + Redis + Celery via docker compose) ----------
setup-backend:
	cd $(BACKEND_DIR) && $(DC) build

start-backend:
	cd $(BACKEND_DIR) && $(DC) up -d

stop-backend:
	cd $(BACKEND_DIR) && $(DC) down

restart-backend:
	cd $(BACKEND_DIR) && $(DC) restart

# ---------- frontend (Next.js dev server via docker compose) ----------
setup-frontend:
	cd $(FRONTEND_DIR) && $(DC) build

start-frontend:
	cd $(FRONTEND_DIR) && $(DC) up -d

stop-frontend:
	cd $(FRONTEND_DIR) && $(DC) down

restart-frontend:
	cd $(FRONTEND_DIR) && $(DC) restart
