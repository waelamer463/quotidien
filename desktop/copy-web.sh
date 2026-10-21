#!/bin/sh
# Copie l'app web (le site) dans dist/ pour l'emballer dans l'app Mac.
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp ../index.html ../connexion.html ../widget.html ../quick.html ../island.html ../manifest.webmanifest dist/
cp -R ../css ../js ../fonts ../icons dist/
