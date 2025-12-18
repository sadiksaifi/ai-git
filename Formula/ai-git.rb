class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.8.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.8.0/ai-git-darwin-arm64.tar.gz"
      sha256 "bf93b98a1259cebeb95835c8ca8e7bbca1edd4ed527600fd45a4efa1a5c722a1"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.8.0/ai-git-darwin-x64.tar.gz"
      sha256 "ab5345f88caa92185d62dbda5f25d41955e3dc86eb5368f9d885582955b8185c"
    end
  end

  def install
    bin.install "ai-git"
  end
end
