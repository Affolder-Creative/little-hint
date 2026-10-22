#!/bin/sh
# Run once as root on the staging host. Never replace a live CA during a redeploy.
set -eu
if [ "$#" -ne 1 ]; then
  echo 'Usage: sh scripts/staging-tls.sh /absolute/new/staging/tls/directory' >&2
  exit 1
fi
case "$1" in /*) ;; *) echo 'Use an absolute directory.' >&2; exit 1 ;; esac
if [ -e "$1" ]; then
  echo 'Refusing to overwrite an existing TLS directory.' >&2
  exit 1
fi
umask 077
mkdir -p "$1"
openssl req -x509 -newkey rsa:3072 -nodes -days 365 -sha256 \
  -keyout "$1/ca.key" -out "$1/ca.crt" -subj '/CN=Little Hint staging SMTP CA' \
  -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl req -newkey rsa:3072 -nodes -sha256 \
  -keyout "$1/mailpit.key" -out "$1/mailpit.csr" -subj '/CN=mailpit'
cat > "$1/mailpit.ext" <<'EXT'
subjectAltName=DNS:mailpit
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT
openssl x509 -req -in "$1/mailpit.csr" -CA "$1/ca.crt" -CAkey "$1/ca.key" \
  -CAcreateserial -days 365 -sha256 -extfile "$1/mailpit.ext" -out "$1/mailpit.crt"
# Containers can read public certificates. Only Mailpit receives the server key;
# the private CA key stays on the host and is never mounted into any container.
chmod 755 "$1"
chmod 644 "$1/ca.crt" "$1/mailpit.crt"
printf '%s\n' 'Staging SMTP certificates created. Renew before their one-year expiry.'
