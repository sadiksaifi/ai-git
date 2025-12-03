class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages from your staged changes."
  homepage "https://github.com/sadiksaifi/ai-git"
  version 0.1.1

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.1/ai-git-darwin-arm64.tar.gz"
      sha256 "cc728744787e33ad5b19f06cca41173c280b0b474538d14528f714e12598a83a"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.1/ai-git-darwin-x64.tar.gz"
      sha256 "b39ad159e7828bf33c25c192d4acfbecf0bb1588116b7e415d0ac5a41bd28fd1"
    end
  end

  def install
    bin.install "ai-git"
  end
end
