class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.2.3"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.3/ai-git-darwin-arm64.tar.gz"
      sha256 "85342125cc10273c6b95b81ddca8ebb0886bcebf1d0e378751e0eda1edfe7dfa"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.3/ai-git-darwin-x64.tar.gz"
      sha256 "8e55e9c35282bb30bd24aa496a43a5e772827db7445ecd4fcb9beab515dd553f"
    end
  end

  def install
    bin.install "ai-git"
  end
end
