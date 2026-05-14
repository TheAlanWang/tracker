.PHONY: dev test migrate seed clean

dev:
	@echo "Run 'supabase start' first, then start api and web in parallel."
	@echo "TODO: wire this up in Task 17."

test:
	@echo "TODO: wire this up in Task 17."

migrate:
	supabase db reset

seed:
	@echo "TODO: wire this up in Task 17."

clean:
	supabase stop
