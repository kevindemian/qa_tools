#!/bin/bash

WIN_CONFIG="/mnt/c/Users/$USER/.wslconfig"

# Desabilitar autoProxy no Windows
echo -e "[wsl2]\nautoProxy=false" > "$WIN_CONFIG"

# Limpar variáveis no WSL
unset http_proxy https_proxy ftp_proxy all_proxy
unset HTTP_PROXY HTTPS_PROXY FTP_PROXY ALL_PROXY

echo "autoProxy desabilitado no Windows e proxy limpo no WSL."
echo "Execute: wsl --shutdown no Windows para aplicar."