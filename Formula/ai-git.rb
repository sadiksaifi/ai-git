class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages from your staged changes."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.1.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.2/ai-git-darwin-arm64.tar.gz"
      sha256 "c45b80653d1d953960f5553f595f94c24f7693169c46d783b58565f0142daaac"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.2/ai-git-darwin-x64.tar.gz"
      sha256 "4d73b02c51c73d9bde0e4c65994eb0c2fc496658a6a39f974fbccca20c1a74eb"
    end
  end

  def install
    bin.install "ai-git"
  end
end
