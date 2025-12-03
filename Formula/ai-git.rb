class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.2.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.1/ai-git-darwin-arm64.tar.gz"
      sha256 "1627562fa854e8ffe0043fed9eca2e55e7abfb698667bdb761accee9cf94a751"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.1/ai-git-darwin-x64.tar.gz"
      sha256 "13f6be997601f7d9da4a18661169571b74d717c124debe9517634230a68593b9"
    end
  end

  def install
    bin.install "ai-git"
  end
end
