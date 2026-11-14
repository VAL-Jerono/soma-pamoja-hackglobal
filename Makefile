up: ; docker compose up --build
down: ; docker compose down
logs: ; docker compose logs -f sp-api
test: ; PYTHONPATH=api python3 -m pytest -q tests
bank: ; PYTHONPATH=api python3 tools/validate_bank.py --mode=structural && PYTHONPATH=api python3 tools/build_bank_json.py
bank-release: ; PYTHONPATH=api python3 tools/validate_bank.py --mode=release
eval: ; PYTHONPATH=api python3 tools/run_eval.py
psql: ; docker compose exec sp-db psql -U sp
activities: ; python3 tools/build_activities_json.py
rag: ; python3 tools/validate_rag.py

