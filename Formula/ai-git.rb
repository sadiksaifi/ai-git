class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.6.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.6.0/ai-git-darwin-arm64.tar.gz"
      sha256 "5c7a516bdf321ce5758f6da088a8909ab9260ec873de53007cc3b14de1294153"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.6.0/ai-git-darwin-x64.tar.gz"
      sha256 "84ec65e79bfdef9788da723f2eb7a532157157eef137e71161cc19b6dfaed5a2"
    end
  end

  def install
    bin.install "ai-git"
  end
end
