class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.4.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.2/ai-git-darwin-arm64.tar.gz"
      sha256 "938a6a497e3ade4d9bc9d4f0ce05bc94dff8da15840a06aeb75ceb570ce2dbd8"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.4.2/ai-git-darwin-x64.tar.gz"
      sha256 "70251f3070aa51996b7513cb653826c485d3f0644719883aac5b6f0ddd7037bc"
    end
  end

  def install
    bin.install "ai-git"
  end
end
