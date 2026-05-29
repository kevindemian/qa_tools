#!/bin/bash
# Cria 1 test case + TE com delays para rate limit
set -e

source .env
AUTH="Authorization: Bearer $JIRA_PERSONAL_TOKEN"
JIRA="https://jira.euronext.com/rest/api/2"
XRAY="https://jira.euronext.com/rest/raven/2.0/api"
PROJECT="ECSPOL"
PRECOND="ECSPOL-1202"
LINKED="ECSPOL-1255"
CREATED_KEY=""

echo "=== FASE 3: Criar test case ==="

# Wait for rate limit cooldown
echo "Aguardando 15s para cooldown..."
sleep 15

echo "1/4 — Criando issue Test..."
RESP=$(curl -s -w "\n%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST -d '{
    "fields": {
      "project": {"key": "'$PROJECT'"},
      "summary": "TC E2E - Teste automatizado de integracao",
      "description": "Teste criado pelo e2e real (curl) para validar pipeline CSV -> Jira -> Xray",
      "issuetype": {"name": "Test"},
      "labels": ["e2e"],
      "customfield_13708": ["'$PRECOND'"]
    }
  }' "$JIRA/issue")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP $HTTP_CODE"
if [ "$HTTP_CODE" = "201" ]; then
  CREATED_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
  echo "  Key: $CREATED_KEY"
  echo "  $JIRA/issue/$CREATED_KEY"
else
  echo "  ERRO: $BODY"
  exit 1
fi

sleep 5

echo "2/4 — Adicionando steps..."
for i in 1 2 3; do
  case $i in
    1) ACTION="Acessar sistema"; DATA="E2E-URL"; EXPECTED="Sistema carregado";;
    2) ACTION="Executar acao de teste"; DATA=""; EXPECTED="Acao concluida";;
    3) ACTION="Validar resultado"; DATA=""; EXPECTED="Resultado conforme esperado";;
  esac
  echo "  Step $i..."
  curl -s -H "$AUTH" -H "Content-Type: application/json" \
    -X POST -d "{\"index\":$i,\"fields\":{\"Action\":\"$ACTION\",\"Data\":\"$DATA\",\"Expected Result\":\"$EXPECTED\"}}" \
    "$XRAY/test/$CREATED_KEY/steps" > /dev/null
  sleep 4
done
echo "  3 steps adicionados."

sleep 5

echo "3/4 — Linkando issue $LINKED..."
LINK_TYPE_ID=$(curl -s -H "$AUTH" "$JIRA/issueLinkType" | \
  python3 -c "import sys,json; types=json.load(sys.stdin)['issueLinkTypes']; print([t['id'] for t in types if t['name']=='Tests'][0])" 2>/dev/null || echo "")
if [ -n "$LINK_TYPE_ID" ]; then
  curl -s -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
    -X POST -d "{\"type\":{\"id\":\"$LINK_TYPE_ID\"},\"inwardIssue\":{\"key\":\"$LINKED\"},\"outwardIssue\":{\"key\":\"$CREATED_KEY\"}}" \
    "$JIRA/issueLink"
  echo ""
  echo "  Link criado."
else
  echo "  Link type 'Tests' não encontrado, tentando por nome..."
  curl -s -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
    -X POST -d "{\"type\":{\"name\":\"Tests\"},\"inwardIssue\":{\"key\":\"$LINKED\"},\"outwardIssue\":{\"key\":\"$CREATED_KEY\"}}" \
    "$JIRA/issueLink"
  echo ""
fi

sleep 5

echo "=== FASE 4: Criar Test Execution ==="
echo "4/4 — Criando Test Execution..."

TEST_KEYS="[\"$CREATED_KEY\",\"$LINKED\"]"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Descobrir issue type ID para "Test Execution"
EXEC_TYPE_ID=$(curl -s -H "$AUTH" "$JIRA/issuetype" | \
  python3 -c "import sys,json; types=json.load(sys.stdin); print([t['id'] for t in types if t['name']=='Test Execution'][0])")

sleep 3

# Descobrir custom field ID para Test Execution
EXEC_FIELD_ID=$(curl -s -H "$AUTH" "$JIRA/field" | \
  python3 -c "import sys,json; fields=json.load(sys.stdin); print([f['id'] for f in fields if f['schema'].get('custom')=='com.xpandit.plugins.xray:testexec-tests-custom-field'][0])")

sleep 3

echo "  Exec type: $EXEC_TYPE_ID, field: $EXEC_FIELD_ID"
RESP_TE=$(curl -s -w "\n%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST -d '{
    "fields": {
      "project": {"key": "'$PROJECT'"},
      "summary": "E2E Smoke - '"$TIMESTAMP"'",
      "description": "Teste automatizado e2e - qa_tools",
      "issuetype": {"id": "'$EXEC_TYPE_ID'"},
      "'$EXEC_FIELD_ID'": '$TEST_KEYS'
    }
  }' "$JIRA/issue")
TE_HTTP=$(echo "$RESP_TE" | tail -1)
TE_BODY=$(echo "$RESP_TE" | sed '$d')
if [ "$TE_HTTP" = "201" ]; then
  TE_KEY=$(echo "$TE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
  echo "  TE criada: $TE_KEY"
  echo "  $JIRA/issue/$TE_KEY"
else
  echo "  ERRO TE: HTTP $TE_HTTP"
  echo "  $TE_BODY"
  exit 1
fi

echo ""
echo "=== RESUMO ==="
echo "  Novo Test: $CREATED_KEY → https://jira.euronext.com/browse/$CREATED_KEY"
echo "  TE criada: $TE_KEY → https://jira.euronext.com/browse/$TE_KEY"
echo "  Passos executados: issue criada + 3 steps + link $LINKED + TE com ambos"
