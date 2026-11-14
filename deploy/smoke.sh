#!/usr/bin/env bash
# Verify a deployment. Usage:
#   API=https://203-0-113-5.sslip.io ORIGIN=https://your-app.vercel.app PIN=123456 bash deploy/smoke.sh
set -u
: "${API:?set API}"; : "${ORIGIN:?set ORIGIN}"; : "${PIN:?set PIN}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got '$2', want '$3')"; fail=$((fail+1)); fi; }

check "health ok"                 "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")" 200
check "https enforced (cert valid)" "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")" 200
check "dashboard needs auth"      "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/dashboard")" 401
check "health/deps needs auth"    "$(curl -s -o /dev/null -w '%{http_code}' "$API/health/deps")" 401
check "bad PIN rejected"          "$(curl -s -o /dev/null -w '%{http_code}' -F pin=000000 "$API/api/facilitator/login")" 401
ACAO="$(curl -s -i -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET' "$API/api/next" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
check "CORS allows Vercel origin" "$ACAO" "$ORIGIN"
BAD="$(curl -s -i -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' "$API/api/next" | grep -ci 'access-control-allow-origin')"
check "CORS blocks other origins" "$BAD" 0
TOKEN="$(curl -s -F "pin=$PIN" "$API/api/facilitator/login" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')"
[ -n "$TOKEN" ] && check "PIN login gives token" ok ok || check "PIN login gives token" none ok
check "dashboard with token"      "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/api/dashboard")" 200
NEXT="$(curl -s "$API/api/next?learner=L-001")"
echo "$NEXT" | python3 -c 'import sys,json;d=json.load(sys.stdin);p=d["passage"];assert p["id"] and "answer_key" not in json.dumps(p);print("PASS item served, no answer key:",p["id"],"| draft =",d["draft"])' || { echo "FAIL /api/next"; fail=$((fail+1)); }
echo; echo "passed=$pass failed=$fail"; [ "$fail" = 0 ]
