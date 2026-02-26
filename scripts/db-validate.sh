#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# BONSAI DB VALIDATION — Catch inconsistencies before they hit the UI
# ════════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./scripts/db-validate.sh              # Validate prod DB
#   BONSAI_ENV=dev ./scripts/db-validate.sh  # Validate dev DB
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV="${BONSAI_ENV:-prod}"

if [ "$ENV" = "dev" ]; then
  DB="$WEBAPP_DIR/.data/bonsai-dev.db"
  LABEL="DEV"
else
  DB="$WEBAPP_DIR/.data/bonsai.db"
  LABEL="PROD"
fi

BOLD="\033[1m"
RED="\033[1;31m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RESET="\033[0m"

FAILURES=0

check_pass() { echo -e "  ${GREEN}✓${RESET} $1"; }
check_fail() { echo -e "  ${RED}✗${RESET} $1"; FAILURES=$((FAILURES + 1)); }
check_warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }

echo
echo -e "${BOLD}Bonsai DB Validation — ${LABEL}${RESET}"
echo "Database: $DB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "$DB" ]; then
  echo -e "${RED}Database not found: $DB${RESET}"
  exit 1
fi

q() { sqlite3 "$DB" "$1"; }

# ── 1. Known slugs that should NOT exist (legacy/renamed) ───────────────
echo
echo -e "${BOLD}1. Banned slugs / stale names${RESET}"

BANNED_ROLE_SLUGS=("miniclaw_soul" "lead" "critic")
for slug in "${BANNED_ROLE_SLUGS[@]}"; do
  count=$(q "SELECT COUNT(*) FROM roles WHERE slug = '$slug';")
  if [ "$count" -gt 0 ]; then
    check_fail "roles.slug = '$slug' still exists ($count row(s))"
  else
    check_pass "roles.slug '$slug' not present"
  fi
done

BANNED_ROLE_TITLES=("MiniClaw Soul" "Lead" "Critic")
for title in "${BANNED_ROLE_TITLES[@]}"; do
  count=$(q "SELECT COUNT(*) FROM roles WHERE title = '$title';")
  if [ "$count" -gt 0 ]; then
    check_fail "roles.title = '$title' still exists ($count row(s))"
  else
    check_pass "roles.title '$title' not present"
  fi
done

BANNED_PERSONA_ROLES=("miniclaw_soul" "lead" "critic")
for role in "${BANNED_PERSONA_ROLES[@]}"; do
  count=$(q "SELECT COUNT(*) FROM personas WHERE role = '$role';")
  if [ "$count" -gt 0 ]; then
    check_fail "personas.role = '$role' still exists ($count row(s)) — run: UPDATE personas SET role='operator' WHERE role='$role';"
  else
    check_pass "personas.role '$role' not present"
  fi
done

# ── 2. Personas reference valid role slugs ──────────────────────────────
echo
echo -e "${BOLD}2. Referential integrity — personas → roles${RESET}"

orphans=$(q "SELECT id, name, role FROM personas WHERE role NOT IN (SELECT slug FROM roles) AND role IS NOT NULL;")
if [ -n "$orphans" ]; then
  check_fail "Orphaned personas (role not in roles table):"
  echo "$orphans" | while IFS='|' read -r id name role; do
    echo "      persona id=$id name=$name has role='$role' (no matching roles.slug)"
  done
else
  check_pass "All personas reference valid role slugs"
fi

# ── 3. Settings — no stale context_role / prompt keys ───────────────────
echo
echo -e "${BOLD}3. Settings keys — no banned role contexts${RESET}"

BANNED_SETTING_KEYS=("context_role_lead" "context_role_critic" "prompt_lead_new_ticket" "prompt_lead_new_epic")
for key in "${BANNED_SETTING_KEYS[@]}"; do
  count=$(q "SELECT COUNT(*) FROM settings WHERE key = '$key';")
  if [ "$count" -gt 0 ]; then
    check_fail "settings key '$key' still exists — run: DELETE FROM settings WHERE key='$key';"
  else
    check_pass "settings key '$key' not present"
  fi
done

# Check for @lead or @critic mentions in stored prompts
lead_mentions=$(q "SELECT key FROM settings WHERE value LIKE '%@lead%' OR value LIKE '%@critic%';")
if [ -n "$lead_mentions" ]; then
  check_fail "Settings contain @lead or @critic mentions:"
  echo "$lead_mentions" | while read -r key; do
    echo "      key=$key"
  done
else
  check_pass "No @lead or @critic mentions in settings"
fi

# ── 4. Source code — no banned strings ──────────────────────────────────
echo
echo -e "${BOLD}4. Source code — banned strings${RESET}"

BANNED_STRINGS=("miniclaw_soul" "MiniClaw Soul" "context_role_lead" "context_role_critic")
for str in "${BANNED_STRINGS[@]}"; do
  hits=$(grep -r "$str" "$WEBAPP_DIR/src" "$WEBAPP_DIR/prompts" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.md" -l 2>/dev/null)
  if [ -n "$hits" ]; then
    check_fail "'$str' found in source:"
    echo "$hits" | while read -r f; do echo "      $f"; done
  else
    check_pass "'$str' not found in source"
  fi
done

# ── 5. Required roles exist ──────────────────────────────────────────────
echo
echo -e "${BOLD}5. Required roles present${RESET}"

REQUIRED_SLUGS=("researcher" "developer" "designer" "operator")
for slug in "${REQUIRED_SLUGS[@]}"; do
  count=$(q "SELECT COUNT(*) FROM roles WHERE slug = '$slug';")
  if [ "$count" -eq 0 ]; then
    check_fail "Required role '$slug' MISSING from roles table"
  else
    check_pass "Role '$slug' present"
  fi
done

# ── 6. agent_runs schema has new columns ────────────────────────────────
echo
echo -e "${BOLD}6. DB schema — agent_runs columns${RESET}"

REQUIRED_COLS=("last_report_message" "cost_usd" "input_tokens" "output_tokens" "cache_read_tokens" "session_id" "model_usage")
for col in "${REQUIRED_COLS[@]}"; do
  exists=$(q "SELECT COUNT(*) FROM pragma_table_info('agent_runs') WHERE name='$col';")
  if [ "$exists" -eq 0 ]; then
    check_fail "agent_runs missing column '$col' — run: ALTER TABLE agent_runs ADD COLUMN $col TEXT;"
  else
    check_pass "agent_runs.$col exists"
  fi
done

# ticket_attachments tag column
tag_col=$(q "SELECT COUNT(*) FROM pragma_table_info('ticket_attachments') WHERE name='tag';")
if [ "$tag_col" -eq 0 ]; then
  check_fail "ticket_attachments missing column 'tag' — run: ALTER TABLE ticket_attachments ADD COLUMN tag TEXT;"
else
  check_pass "ticket_attachments.tag exists"
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ All checks passed (${LABEL})${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ $FAILURES check(s) failed (${LABEL})${RESET}"
  echo -e "  Run the fix commands shown above, then: pm2 restart bonsai-prod"
  exit 1
fi
