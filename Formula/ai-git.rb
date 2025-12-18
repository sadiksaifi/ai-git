class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.9.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.9.0/ai-git-darwin-arm64.tar.gz"
      sha256 "1207a70b84064139137b14d3a740e94f7a0cf09e0bfb48a878e2dca370ca25c6"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.9.0/ai-git-darwin-x64.tar.gz"
      sha256 "7608bc08aafca609fd8ac266dc5ab9373bd29d99b4597920fe3aeacf8e6f745f"
    end
  end

  def install
    bin.install "ai-git"
  end
end
