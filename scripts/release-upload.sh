#!/bin/bash
set -euo pipefail

# Upload Pinchr builds to S3
# Usage: yarn release:upload
# Requires: AWS CLI configured, LAUNCHPAD_ENV or AWS creds in env

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"

# Get version from package.json
VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")
BUCKET="pinchr-releases"
REGION="us-east-1"

# Load AWS credentials from launchpad .env if not already set
if [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  LAUNCHPAD_ENV="${LAUNCHPAD_ENV:-$HOME/Downloads/Development/launchpad/.env}"
  if [ -f "$LAUNCHPAD_ENV" ]; then
    export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY "$LAUNCHPAD_ENV" | cut -d= -f2)
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-AKIAXEQKF4VLHTWTJ2OZ}"
  fi
fi

export AWS_DEFAULT_REGION="$REGION"

echo "📦 Uploading Pinchr v${VERSION} to s3://${BUCKET}/"

# Find DMG and ZIP
DMG=$(ls "$DIST_DIR"/Pinchr-*-arm64.dmg 2>/dev/null | head -1)
ZIP=$(ls "$DIST_DIR"/Pinchr-*-arm64-mac.zip 2>/dev/null | head -1)

if [ -z "$DMG" ]; then
  echo "❌ No DMG found in $DIST_DIR — run 'yarn dist' first"
  exit 1
fi

# Upload to versioned path
echo "⬆️  Uploading to v${VERSION}/..."
aws s3 cp "$DMG" "s3://${BUCKET}/v${VERSION}/$(basename "$DMG")"
[ -n "$ZIP" ] && aws s3 cp "$ZIP" "s3://${BUCKET}/v${VERSION}/$(basename "$ZIP")"

# Also upload to v0.1.0-alpha/ (legacy download URL)
echo "⬆️  Updating legacy download path (v0.1.0-alpha/)..."
aws s3 cp "$DMG" "s3://${BUCKET}/v0.1.0-alpha/Pinchr-0.1.0-arm64.dmg"
[ -n "$ZIP" ] && aws s3 cp "$ZIP" "s3://${BUCKET}/v0.1.0-alpha/Pinchr-0.1.0-arm64-mac.zip"

echo ""
echo "✅ Pinchr v${VERSION} uploaded!"
echo "   DMG: https://${BUCKET}.s3.${REGION}.amazonaws.com/v${VERSION}/$(basename "$DMG")"
echo "   Legacy: https://${BUCKET}.s3.${REGION}.amazonaws.com/v0.1.0-alpha/Pinchr-0.1.0-arm64.dmg"
