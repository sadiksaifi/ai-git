class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.4.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.1/ai-git-darwin-arm64.tar.gz"
      sha256 "118260474ccac3e71014792aeb2b254c931f2d30648b921391674c8d67991700"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.1/ai-git-darwin-x64.tar.gz"
      sha256 "83d14a878738065d685d155fa0ba27cafa6ac2346e7e2682d76b47fcf9ae4473"
    end
  end

  def install
    bin.install "ai-git"
  end
end
