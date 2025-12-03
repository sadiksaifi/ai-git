class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.1.3"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.3/ai-git-darwin-arm64.tar.gz"
      sha256 "6ab926bf73de75e71294b852a1869f1034b23e4b6c6694a048015830f913f93e"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.3/ai-git-darwin-x64.tar.gz"
      sha256 "ba769ccd2d0eedde5a10dfb61f7b769c80ac8af1400dc91edb49f192852cc9bd"
    end
  end

  def install
    bin.install "ai-git"
  end
end
