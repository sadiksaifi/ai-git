class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.3.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.1/ai-git-darwin-arm64.tar.gz"
      sha256 "9e53a0ca7a6e02f0dc217d02cef2ec188b927f2f9a63a637caf08e9c6d77ca68"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.1/ai-git-darwin-x64.tar.gz"
      sha256 "6981fed24da67528f2183bca40150a15ee3f71a485ba8e480f20e230e7effceb"
    end
  end

  def install
    bin.install "ai-git"
  end
end
