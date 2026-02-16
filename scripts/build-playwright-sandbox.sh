#!/bin/bash
# Build Playwright-enabled sandbox image

set -e

IMAGE_NAME="opencode-sandbox-playwright"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "🔨 Building Playwright sandbox image: ${FULL_IMAGE}"

# Build image
docker build -f Dockerfile.sandbox-playwright -t "${FULL_IMAGE}" .

echo "✅ Build complete: ${FULL_IMAGE}"
echo ""
echo "To test the image:"
echo "  docker run -p 9223:9223 ${FULL_IMAGE}"
echo ""
echo "To use in OpenCode, update DEFAULT_IMAGE in:"
echo "  packages/opencode/src/docker/container-lifecycle.ts"
echo "  Change: export const DEFAULT_IMAGE = \"${FULL_IMAGE}\""
