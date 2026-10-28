#!/bin/sh
set -eu
umask 077
# The CA is used only for internal SMTP. Browsers never receive this certificate.
cd /tls
if [ ! -s ca.crt ] || ! openssl x509 -checkend 86400 -noout -in ca.crt; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -sha256 \
    -keyout ca.key -out ca.crt -subj '/CN=Little Hint preview SMTP CA' \
    -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
  rm -f mailpit.crt
fi
if [ ! -s mailpit.crt ] || ! openssl x509 -checkend 86400 -noout -in mailpit.crt; then
  openssl req -newkey rsa:3072 -nodes -sha256 \
    -keyout mailpit.key -out mailpit.csr -subj '/CN=mailpit'
  printf '%s\n' 'subjectAltName=DNS:mailpit' 'basicConstraints=critical,CA:FALSE' \
    'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' > mailpit.ext
  openssl x509 -req -in mailpit.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days 365 -sha256 -extfile mailpit.ext -out mailpit.crt
  echo "SMTP certificates renewed"
fi
chmod 755 /tls
chmod 644 ca.crt mailpit.crt
