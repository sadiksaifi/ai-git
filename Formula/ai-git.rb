class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.0/ai-git-darwin-arm64.tar.gz"
      sha256 "2cdacb8b4fd57c3fc3ddbf115c6d962f57a0e8ad77ae336711d6f034c4c70d4b"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.0/ai-git-darwin-x64.tar.gz"
      sha256 "b51877fbefd4c3d55ddd07d3d7d297bd762da6ac639d25431d0995ea2132e76f"
    end
  end

  def install
    bin.install "ai-git"
  end
end
