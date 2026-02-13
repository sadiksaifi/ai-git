#!/usr/bin/env bash
# AI Git installer — https://ai-git.xyz
#
# Usage:
#   curl -fsSL https://ai-git.xyz/install | bash
#   curl -fsSL https://ai-git.xyz/install | bash -s -- --version v2.5.0
#   curl -fsSL https://ai-git.xyz/install | bash -s -- --no-modify-path
set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

REPO="sadiksaifi/ai-git"
INSTALL_DIR="${AI_GIT_INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/ai-git"
VERSION=""
MODIFY_PATH=true

# ==============================================================================
# Helpers
# ==============================================================================

info() { printf '\033[0;34m%s\033[0m\n' "$*"; }
success() { printf '\033[0;32m%s\033[0m\n' "$*"; }
error() { printf '\033[0;31merror: %s\033[0m\n' "$*" >&2; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

need_cmd() {
  if ! command -v "$1" > /dev/null 2>&1; then
    error "required command not found: $1"
    exit 1
  fi
}

# ==============================================================================
# Parse arguments
# ==============================================================================

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --no-modify-path)
      MODIFY_PATH=false
      shift
      ;;
    *)
      error "unknown option: $1"
      exit 1
      ;;
  esac
done

# ==============================================================================
# Detect platform
# ==============================================================================

detect_platform() {
  local os arch

  os="$(uname -s)"
  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)
      error "unsupported OS: $os"
      exit 1
      ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      error "unsupported architecture: $arch"
      exit 1
      ;;
  esac

  PLATFORM="${os}-${arch}"
  ARCHIVE="ai-git-${PLATFORM}.tar.gz"
}

# ==============================================================================
# Fetch latest version if not specified
# ==============================================================================

resolve_version() {
  if [ -n "$VERSION" ]; then
    return
  fi

  info "Fetching latest version..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    -H "Accept: application/vnd.github.v3+json" \
    | grep '"tag_name"' \
    | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/')

  if [ -z "$VERSION" ]; then
    error "failed to determine latest version"
    exit 1
  fi
}

# ==============================================================================
# Download & verify
# ==============================================================================

download_and_install() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  local tarball_url="https://github.com/${REPO}/releases/download/${VERSION}/${ARCHIVE}"
  local checksums_url="https://github.com/${REPO}/releases/download/${VERSION}/checksums.txt"

  info "Downloading ai-git ${VERSION} (${PLATFORM})..."
  curl -fsSL "$tarball_url" -o "${tmp_dir}/${ARCHIVE}"
  curl -fsSL "$checksums_url" -o "${tmp_dir}/checksums.txt"

  # Verify checksum
  info "Verifying checksum..."
  local expected_hash actual_hash
  expected_hash=$(grep "$ARCHIVE" "${tmp_dir}/checksums.txt" | awk '{print $1}')
  if [ -z "$expected_hash" ]; then
    error "checksum entry not found for ${ARCHIVE}"
    exit 1
  fi

  if command -v sha256sum > /dev/null 2>&1; then
    actual_hash=$(sha256sum "${tmp_dir}/${ARCHIVE}" | awk '{print $1}')
  else
    actual_hash=$(shasum -a 256 "${tmp_dir}/${ARCHIVE}" | awk '{print $1}')
  fi

  if [ "$expected_hash" != "$actual_hash" ]; then
    error "checksum mismatch!"
    error "  expected: $expected_hash"
    error "  actual:   $actual_hash"
    exit 1
  fi

  # Extract
  info "Extracting..."
  tar -xzf "${tmp_dir}/${ARCHIVE}" -C "$tmp_dir"

  # Install
  mkdir -p "$INSTALL_DIR"
  mv "${tmp_dir}/ai-git" "${INSTALL_DIR}/ai-git"
  chmod +x "${INSTALL_DIR}/ai-git"

  # Write install method marker
  mkdir -p "$STATE_DIR"
  echo "curl" > "${STATE_DIR}/install-method"
}

# ==============================================================================
# PATH setup
# ==============================================================================

setup_path() {
  if [ "$MODIFY_PATH" = false ]; then
    return
  fi

  # Check if already in PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) return ;;
  esac

  local path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
  local shell_name
  shell_name="$(basename "${SHELL:-/bin/sh}")"

  case "$shell_name" in
    bash)
      local rc="$HOME/.bashrc"
      if ! grep -qF "$INSTALL_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# ai-git" >> "$rc"
        echo "$path_line" >> "$rc"
        info "Added ${INSTALL_DIR} to PATH in ${rc}"
      fi
      ;;
    zsh)
      local rc="$HOME/.zshrc"
      if ! grep -qF "$INSTALL_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# ai-git" >> "$rc"
        echo "$path_line" >> "$rc"
        info "Added ${INSTALL_DIR} to PATH in ${rc}"
      fi
      ;;
    fish)
      local fish_conf="$HOME/.config/fish/conf.d/ai-git.fish"
      mkdir -p "$(dirname "$fish_conf")"
      if [ ! -f "$fish_conf" ]; then
        echo "set -gx PATH ${INSTALL_DIR} \$PATH" > "$fish_conf"
        info "Created ${fish_conf}"
      fi
      ;;
    *)
      info "Add ${INSTALL_DIR} to your PATH manually."
      ;;
  esac
}

# ==============================================================================
# Main
# ==============================================================================

main() {
  need_cmd curl
  need_cmd tar

  bold "ai-git installer"
  echo ""

  detect_platform
  resolve_version
  download_and_install
  setup_path

  echo ""
  success "ai-git ${VERSION} installed to ${INSTALL_DIR}/ai-git"
  echo ""

  # Check if install dir is in current PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*)
      info "Run 'ai-git' to get started."
      ;;
    *)
      info "Restart your shell or run:"
      echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      ;;
  esac
}

main
