class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.3.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.0/ai-git-darwin-arm64.tar.gz"
      sha256 "2aadedb4c69d39225c9e4ca4ab33d9e4641cf8a4d65a84594160818cca064e6c"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.0/ai-git-darwin-x64.tar.gz"
      sha256 "d5d851a21103009b60d869288a66e20cad6fd267001dc129172c64db02ae3886"
    end
  end

  def install
    bin.install "ai-git"
  end
end
