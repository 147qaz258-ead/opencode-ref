# E2B VNC Sandbox Template
#
# This template provides a complete Ubuntu desktop environment with VNC
# remote desktop access, suitable for AI code execution scenarios.
#
# Ports:
#   - 5901: VNC server (RFB protocol)
#   - 6080: noVNC WebSocket (HTML5 VNC client)
#
# Usage:
#   e2b template create vnc-sandbox --dockerfile Dockerfile

FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV VNC geometry=1280x800
ENV VNC_DEPTH=24

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Core utilities
    curl \
    wget \
    git \
    vim \
    nano \
    build-essential \
    ca-certificates \
    sudo \
    # Python ecosystem
    python3 \
    python3-pip \
    python3-venv \
    # Node.js ecosystem
    nodejs \
    npm \
    # VNC components
    tigervnc-standalone-server \
    novnc \
    websockify \
    # Desktop environment (lightweight)
    xfce4 \
    xfce4-goodies \
    # Additional tools
    htop \
    tree \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Configure VNC
RUN mkdir -p /root/.vnc

# Set VNC password (default: opencode)
# For production, this should be configurable
RUN echo "opencode" | vncpasswd -f > /root/.vnc/passwd && \
    chmod 600 /root/.vnc/passwd

# Create VNC startup script
RUN echo '#!/bin/bash\n\
# Start VNC server with specified geometry and depth\n\
vncserver :1 -geometry ${VNC_GEOMETRY:-1280x800} -depth ${VNC_DEPTH:-24}\n\
\n\
# Start websockify to bridge WebSocket and VNC\n\
websockify --web=/usr/share/novnc 6080 localhost:5901\n\
\n\
# Keep container running\n\
echo "VNC server started on display :1"\n\
echo "noVNC available on port 6080"\n\
tail -f /dev/null\n' > /usr/local/bin/vnc-start.sh && \
    chmod +x /usr/local/bin/vnc-start.sh

# Create workspace directory
RUN mkdir -p /home/workspace && \
    chmod 755 /home/workspace

WORKDIR /home/workspace

# Expose VNC and noVNC ports
EXPOSE 5901 6080

# Health check: Verify VNC server is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep vnc || exit 1

# Start VNC server and noVNC
CMD ["/usr/local/bin/vnc-start.sh"]
