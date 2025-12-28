class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.11.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.11.0/ai-git-darwin-arm64.tar.gz"
      sha256 "a7d190c8261335a27751029e8b78bf0e8d278bb0049f7f28c042b7a8b10ae8a6"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.11.0/ai-git-darwin-x64.tar.gz"
      sha256 "76d3f0f3439fcdfe8e82d64b708641db80c92b2815875ee83711231f3e0e02c8"
    end
  end

  def install
    bin.install "ai-git"
  end
end
