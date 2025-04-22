#!/bin/bash

# Function to log error messages
log_error() {
    echo "[ERROR] $1" >&2
}

# Function to log info messages
log_info() {
    echo "[INFO] $1" >&2
}

# Validate required environment variables
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    log_error "GOOGLE_CLIENT_ID environment variable is required"
    exit 1
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    log_error "GOOGLE_CLIENT_SECRET environment variable is required"
    exit 1
fi

# Set default workspace path if not provided
if [ -z "$WORKSPACE_BASE_PATH" ]; then
    export WORKSPACE_BASE_PATH="/app/workspace"
fi

# Trap signals for clean shutdown
trap 'log_info "Shutting down..."; exit 0' SIGTERM SIGINT

# Set environment variables
export MCP_MODE=true
export LOG_FILE="/app/logs/google-workspace-mcp.log"
export WORKSPACE_BASE_PATH="$WORKSPACE_BASE_PATH"

# Ensure /app/config/accounts.json exists, copy from example if missing, or create minimal if both missing
if [ ! -f "/app/config/accounts.json" ]; then
    if [ -f "/app/config/accounts.example.json" ]; then
        log_info "accounts.json not found, copying from accounts.example.json"
        cp /app/config/accounts.example.json /app/config/accounts.json
    else
        log_info "accounts.json and accounts.example.json not found, creating minimal accounts.json"
        echo '{ "accounts": [] }' > /app/config/accounts.json
    fi
fi

# Execute the main application
exec node build/index.js
