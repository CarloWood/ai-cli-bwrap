#! /bin/bash

CHATGPT_DOMAINS=(
  chatgpt.com oaistatic.com oaiusercontent.com openai.com auth.openai.com
  statsig.com featuregates.org intercom.io intercomcdn.com
)

OTHER_HTTPS_DOMAINS=(
  # Rust Package Registry.
  index.crates.io static.crates.io crates.io
  # npmjs.
  registry.npmjs.org
  # opencode.
  models.dev
  opencode.ai
  # man pages.
  en.cppreference.com
  stackoverflow.com
  www.geeksforgeeks.org
  invisible-island.net
  docs.oracle.com
  man.archlinux.org
)

CHATGPT_IPV4=()
for d in "${CHATGPT_DOMAINS[@]}"; do
  mapfile -t a4 < <(getent ahostsv4 "$d" | awk '/STREAM/ {print $1}')
  CHATGPT_IPV4+=("${a4[@]}")
done

OTHER_HTTPS_IPV4=()
for d in "${OTHER_HTTPS_DOMAINS[@]}"; do
  mapfile -t a4 < <(getent ahostsv4 "$d" | awk '/STREAM/ {print $1}')
  OTHER_HTTPS_IPV4+=("${a4[@]}")
done

chatgpt_ipv4_csv=$(printf '%s\n' "${CHATGPT_IPV4[@]}" | sort -u | paste -sd, -)
other_https_ipv4_csv=$(printf '%s\n' "${OTHER_HTTPS_IPV4[@]}" | sort -u | paste -sd, -)

nft -f - <<EOF
add table inet nscodex_firewall
add set inet nscodex_firewall chatgpt_ipv4 { type ipv4_addr; }
add set inet nscodex_firewall other_https_ipv4 { type ipv4_addr; }
flush set inet nscodex_firewall chatgpt_ipv4
flush set inet nscodex_firewall other_https_ipv4
add element inet nscodex_firewall chatgpt_ipv4 { ${chatgpt_ipv4_csv} }
add element inet nscodex_firewall other_https_ipv4 { ${other_https_ipv4_csv} }
EOF
