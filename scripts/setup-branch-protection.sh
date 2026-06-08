#!/usr/bin/env bash
set -euo pipefail

# Layer 4.2 — GitHub branch protection configuration helper
# This script outputs the settings to apply via `gh` CLI or GitHub UI.
#
# Usage: ./scripts/setup-branch-protection.sh

echo "============================================================"
echo "  GitHub Branch Protection — Settings for main branch"
echo "============================================================"
echo ""
echo "Apply via GitHub UI: Settings > Branches > Add rule"
echo "Or via gh CLI:"
echo ""
echo "  gh api repos/:owner/:repo/branches/main/protection \\"
echo "    --method PUT \\"
echo "    --input - <<'EOF'"
echo "  {"
echo '    "required_status_checks": {'
echo '      "strict": true,'
echo '      "contexts": ["continuous-integration", "lint", "typecheck"]'
echo "    },"
echo '    "enforce_admins": true,'
echo '    "required_pull_request_reviews": {'
echo '      "required_approving_review_count": 1,'
echo '      "dismiss_stale_reviews": true,'
echo '      "require_code_owner_reviews": true'
echo "    },"
echo '    "restrictions": null,'
echo '    "required_linear_history": true,'
echo '    "allow_force_pushes": false,'
echo '    "allow_deletions": false,'
echo '    "block_creations": true,'
echo '    "required_conversation_resolution": true,'
echo '    "lock_branch": false,'
echo '    "allow_fork_syncing": true'
echo "  }"
echo "  EOF"
echo ""
echo "Replace :owner/:repo with your repo (e.g., kevindemian/qa_tools)"
echo ""
echo "============================================================"
echo "  Managed Config — Layer 4.3"
echo "============================================================"
echo ""
echo "To set up root-owned immutable config:"
echo ""
echo "  sudo mkdir -p /etc/opencode"
echo '  sudo tee /etc/opencode/opencode.json <<'"'"'EOF'"'"''
echo '  {'
echo '    "$schema": "https://opencode.ai/config.json",'
echo '    "permission": {'
echo '      "edit": {"*": "ask"},'
echo '      "bash": {"*": "ask"},'
echo '      "webfetch": "ask",'
echo '      "websearch": "ask",'
echo '      "share": "disabled"'
echo '    }'
echo '  }'
echo '  EOF'
echo "  sudo chown -R root:root /etc/opencode"
echo "  sudo chmod -R 755 /etc/opencode"
echo "  sudo chattr +i /etc/opencode/opencode.json  # make immutable"
echo ""
echo "Then add to ~/.config/opencode/opencode.jsonc:"
echo '  "extends": ["/etc/opencode/opencode.json"]'
echo ""
echo "============================================================"
