class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.3.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.2/ai-git-darwin-arm64.tar.gz"
      sha256 "4f1a254b42b2263c26bf595e84760fa267fb224491d9c60e78aafa8344c454da"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.3.2/ai-git-darwin-x64.tar.gz"
      sha256 "f6905862dc8def8cf21ea8fe382a0aad119305f6e621e7d7b5516db4e3142de0"
    end
  end

  def install
    bin.install "ai-git"
  end
end
