#!/bin/bash
set -e

# Start Xvfb
echo "Starting Xvfb on :99..."
Xvfb :99 -screen 0 1280x1024x24 &
export DISPLAY=:99
sleep 2

# Start Window Manager (Fluxbox)
echo "Starting Fluxbox..."
fluxbox &
sleep 1

# Start VNC Server (no password)
echo "Starting x11vnc..."
x11vnc -display :99 -rfbport 5900 -forever -shared -nopw -quiet -listen 0.0.0.0 -xkb &
sleep 1

# Start Playwright Server
echo "Starting Playwright Server..."
exec node /opt/playwright-server/server.js
