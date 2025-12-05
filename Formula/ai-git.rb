class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.4.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.0/ai-git-darwin-arm64.tar.gz"
      sha256 "93be2c341b0a0cb2d0475b66db776749070a16282cef1266fb6b38a01ee99579"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.0/ai-git-darwin-x64.tar.gz"
      sha256 "d8d633d24140314e0a9d9e23be2f3be324f19606d556f771c68a27c1add0ed84"
    end
  end

  def install
    bin.install "ai-git"
  end
end
